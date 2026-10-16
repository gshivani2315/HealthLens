// backend/src/modules/auth/auth.service.ts   (replaces current)
import type { Session } from '@supabase/supabase-js';
import { prisma } from '../../db';
import { supabaseAdmin, supabaseAuth } from '../../lib/supabase';
import { provisionUser } from '../../lib/provision';

type DbUserLike = { id: string; email: string; name: string; role: string };

function sessionResult(session: Session, dbUser: DbUserLike) {
  return {
    token: session.access_token,
    refreshToken: session.refresh_token, // previously dropped: the app silently broke after ~1 hour
    expiresAt: session.expires_at, // unix seconds
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role.toLowerCase() as 'patient' | 'doctor',
    },
  };
}

export async function login(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.session || !data.user) return null; // route turns this into 401

  const dbUser = await provisionUser(data.user);
  return sessionResult(data.session, dbUser);
}

export async function refresh(refreshToken: string) {
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return null;

  const dbUser = await provisionUser(data.user);
  return sessionResult(data.session, dbUser);
}

export async function registerDoctor(input: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
  phone?: string;
}) {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('An account with this email already exists');

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    // role goes in app_metadata (server-controlled). user_metadata is user-editable and must never carry the role.
    app_metadata: { role: 'DOCTOR' },
    user_metadata: { name: input.name, clinicName: input.clinicName, phone: input.phone },
  });
  if (error || !created.user) {
    throw new Error(
      error?.message?.toLowerCase().includes('already')
        ? 'An account with this email already exists'
        : `Supabase signup failed: ${error?.message}`
    );
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        id: created.user.id,
        name: input.name,
        email,
        password: 'SUPABASE_MANAGED_AUTH',
        role: 'DOCTOR',
        doctor: { create: { clinicName: input.clinicName, phone: input.phone } },
      },
    });
  } catch (err) {
    // Don't leave an orphaned Supabase login behind (it would block a retry with "already exists").
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw err;
  }

  const { data: signedIn, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (signInError || !signedIn.session) {
    throw new Error('Account created, but automatic sign-in failed. Please log in manually.');
  }

  return sessionResult(signedIn.session, user);
}

/** Verifies the current password against Supabase, then sets the new one. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 'not_found' as const;

  const { error: verifyError } = await supabaseAuth.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return 'wrong_password' as const;

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(`Could not update password: ${error.message}`);
  return 'ok' as const;
}