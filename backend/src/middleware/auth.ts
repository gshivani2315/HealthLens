import type { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../lib/jwt';
import { prisma } from '../db';

// Tell Express's Request type that it may carry a `user` after auth runs
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload & { dbUserId?: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = verifyToken(header.slice(7));

    // Look up user in database by ID or by email (in case Supabase Auth UUID differs from User cuid)
    let dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: payload.sub },
          ...(payload.email ? [{ email: payload.email }] : []),
        ],
      },
    });

    // If verified via Supabase Auth but not yet in our database, auto-provision
    if (!dbUser && payload.email) {
      dbUser = await prisma.user.create({
        data: {
          id: payload.sub,
          email: payload.email,
          name: payload.email.split('@')[0],
          password: 'SUPABASE_MANAGED_AUTH',
          role: payload.role,
          ...(payload.role === 'DOCTOR'
            ? { doctor: { create: { clinicName: 'HealthLens Clinic' } } }
            : { patient: { create: { threshold: { create: {} } } } }),
        },
      });
    }

    req.user = {
      ...payload,
      dbUserId: dbUser?.id || payload.sub,
      role: dbUser ? (dbUser.role as 'PATIENT' | 'DOCTOR') : payload.role,
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Array<'PATIENT' | 'DOCTOR'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}