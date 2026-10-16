// backend/src/lib/provision.ts   (NEW)
// Single place that maps a verified Supabase user to our own User row (+ Doctor/Patient row).
// Used by requireAuth, login and refresh so the logic can't drift between them.

import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export class AccountNotLinkedError extends Error {
  code = 'ACCOUNT_NOT_LINKED';
  constructor() {
    super('This email already belongs to an existing HealthLens account that is not linked to this login. Contact an administrator.');
  }
}

export async function provisionUser(supaUser: SupabaseUser) {
  const existing = await prisma.user.findUnique({ where: { id: supaUser.id } });
  if (existing) return existing;

  const email = supaUser.email?.toLowerCase();
  if (!email) throw new Error('Supabase user has no email address');

  // Same email, different id: e.g. a user seeded before their Supabase account existed.
  // We deliberately do NOT auto-link here: anyone able to sign up in Supabase with a victim's
  // email could otherwise take over that account. Linking is done by the trusted seed script / an admin.
  const sameEmail = await prisma.user.findUnique({ where: { email } });
  if (sameEmail) throw new AccountNotLinkedError();

  // ONLY app_metadata is trusted for the role: it can be written with the service-role key only.
  // user_metadata is editable by the user themselves, so reading a role from it would let anyone
  // sign up as a DOCTOR. Anything unrecognised becomes a PATIENT.
  const role: 'PATIENT' | 'DOCTOR' =
    String((supaUser.app_metadata as any)?.role ?? '').toUpperCase() === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

  const meta = (supaUser.user_metadata ?? {}) as any;

  try {
    return await prisma.user.create({
      data: {
        id: supaUser.id,
        email,
        name: meta.name || email.split('@')[0],
        password: 'SUPABASE_MANAGED_AUTH',
        role,
        ...(role === 'DOCTOR'
          ? { doctor: { create: { clinicName: meta.clinicName || 'HealthLens Clinic' } } }
          : { patient: { create: { threshold: { create: {} } } } }),
      },
    });
  } catch (err) {
    // Two first-time requests racing: the loser hits the unique constraint. Return the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.user.findUnique({ where: { id: supaUser.id } });
      if (winner) return winner;
    }
    throw err;
  }
}