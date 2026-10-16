import { prisma } from '../../db';
import { supabaseAdmin, supabaseAuth } from '../../lib/supabase';

export async function login(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return null; // route turns this into 401 "Invalid email or password"
  }

  const supaUser = data.user;
  const rawRole = (supaUser.app_metadata as any)?.role || (supaUser.user_metadata as any)?.role || 'PATIENT';
  const role = String(rawRole).toUpperCase() === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

  let dbUser = await prisma.user.findUnique({ where: { id: supaUser.id } });
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: supaUser.id,
        email: supaUser.email!,
        name: (supaUser.user_metadata as any)?.name || supaUser.email!.split('@')[0],
        password: 'SUPABASE_MANAGED_AUTH',
        role,
        ...(role === 'DOCTOR'
          ? { doctor: { create: { clinicName: (supaUser.user_metadata as any)?.clinicName || 'HealthLens Clinic' } } }
          : { patient: { create: { threshold: { create: {} } } } }),
      },
    });
  }

  return {
    token: data.session.access_token,
    user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role.toLowerCase() as 'patient' | 'doctor' },
  };
}

export async function registerDoctor(data: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
  phone?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error('An account with this email already exists');

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // skip the confirmation-email step so the account works immediately
    user_metadata: { name: data.name, role: 'DOCTOR', clinicName: data.clinicName, phone: data.phone },
  });
  if (error || !created.user) {
    throw new Error(
      error?.message?.toLowerCase().includes('already')
        ? 'An account with this email already exists'
        : `Supabase signup failed: ${error?.message}`
    );
  }

  const user = await prisma.user.create({
    data: {
      id: created.user.id,
      name: data.name,
      email: data.email,
      password: 'SUPABASE_MANAGED_AUTH',
      role: 'DOCTOR',
      doctor: { create: { clinicName: data.clinicName, phone: data.phone } },
    },
    include: { doctor: true },
  });

  const { data: session, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });
  if (signInError || !session.session) {
    throw new Error('Account created, but automatic sign-in failed — please log in manually.');
  }

  return {
    token: session.session.access_token,
    user: { id: user.id, email: user.email, name: user.name, role: 'doctor' as const },
  };
}