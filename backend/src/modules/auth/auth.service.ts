// backend/src/modules/auth/auth.service.ts
import type { Session } from '@supabase/supabase-js';
import { prisma } from '../../db';
import { supabaseAdmin, supabaseAuth } from '../../lib/supabase';
import { provisionUser } from '../../lib/provision';
import { acceptCareInvite } from '../invites/invite.service';

type DbUserLike = { id: string; email: string; name: string; role: string };

function sessionResult(session: Session, dbUser: DbUserLike, extra?: any) {
  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at, // unix seconds
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role.toLowerCase() as 'patient' | 'doctor',
    },
    ...extra,
  };
}

export async function login(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.session || !data.user) return null;

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
    // Create the Clinic first so Doctor.clinicId can reference it
    const clinic = await prisma.clinic.create({
      data: {
        id: `clinic_${created.user.id}`,
        name: input.clinicName || 'HealthLens Clinic',
        phone: input.phone || null,
      },
    });

    user = await prisma.user.create({
      data: {
        id: created.user.id,
        name: input.name,
        email,
        password: 'SUPABASE_MANAGED_AUTH',
        role: 'DOCTOR',
        doctor: {
          create: {
            clinicId:   clinic.id,
            clinicName: input.clinicName, // legacy column kept
            phone:      input.phone,
          },
        },
      },
      include: { doctor: true },
    });
  } catch (err) {
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

/**
 * Self-registration for Patients.
 * Creates account in Supabase + User + Patient, with optional immediate linking via CareInvite code.
 */
export async function registerPatient(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  inviteCode?: string;
}) {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('An account with this email already exists');

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: { role: 'PATIENT' },
    user_metadata: { name: input.name, phone: input.phone },
  });

  if (error || !created.user) {
    throw new Error(
      error?.message?.toLowerCase().includes('already')
        ? 'An account with this email already exists'
        : `Supabase signup failed: ${error?.message}`
    );
  }

  const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  let user;
  try {
    user = await prisma.user.create({
      data: {
        id: created.user.id,
        name: input.name,
        email,
        password: 'SUPABASE_MANAGED_AUTH',
        role: 'PATIENT',
        patient: {
          create: {
            dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : null,
            gender: input.gender || 'Unknown',
            phone: input.phone || '',
            riskStatus: 'NORMAL',
            conditions: { create: [{ label: 'General Monitoring' }] },
            threshold: { create: {} },
          },
        },
      },
      include: { patient: true },
    });
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw err;
  }

  // If patient supplied an invite code, link to doctor immediately
  let inviteResult: any = null;
  if (input.inviteCode) {
    try {
      inviteResult = await acceptCareInvite(input.inviteCode, user.id);
    } catch (inviteErr) {
      console.warn('[RegisterPatient] Auto-link with invite code failed:', inviteErr);
    }
  }

  const { data: signedIn, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (signInError || !signedIn.session) {
    throw new Error('Account created, but automatic sign-in failed. Please log in manually.');
  }

  return sessionResult(signedIn.session, user, {
    linkedCare: inviteResult && !('error' in inviteResult) ? inviteResult : undefined,
  });
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
