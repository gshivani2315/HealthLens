import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthedUser {
  sub: string;
  email?: string;
  role: 'PATIENT' | 'DOCTOR';
  dbUserId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  const supaUser = data.user;

  const rawRole =
    (supaUser.app_metadata as any)?.role ||
    (supaUser.user_metadata as any)?.role ||
    'PATIENT';
  const role: 'PATIENT' | 'DOCTOR' = String(rawRole).toUpperCase() === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

  // Auto-provision for a Supabase user who doesn't yet have a row in our own tables
  // (e.g. created straight from the Supabase dashboard rather than through register-doctor).
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

  req.user = { sub: supaUser.id, email: supaUser.email, role: dbUser.role as 'PATIENT' | 'DOCTOR', dbUserId: dbUser.id };
  next();
}

export function requireRole(...roles: Array<'PATIENT' | 'DOCTOR'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}