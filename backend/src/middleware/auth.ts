// backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { provisionUser } from '../lib/provision';
import { isTokenRevoked } from '../lib/tokenBlacklist';

export interface AuthedUser {
  sub: string;
  email?: string;
  role: 'PATIENT' | 'DOCTOR';
  dbUserId: string;
  token?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Express 4 does not catch rejections from async middleware. Without this try/catch, a database
  // or Supabase hiccup becomes an unhandled promise rejection (a hung request, or a crashed process).
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }
    const token = header.slice(7);

    // Check server revocation list (stateful logout)
    if (isTokenRevoked(token)) {
      return res.status(401).json({ message: 'Token has been revoked, please sign in again' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      const status = (error as any)?.status;
      if (error?.name === 'AuthRetryableFetchError' || (typeof status === 'number' && status >= 500)) {
        return res.status(503).json({ message: 'Authentication service unavailable, please retry' });
      }
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const dbUser = await provisionUser(data.user);

    req.user = {
      sub: data.user.id,
      email: data.user.email,
      role: dbUser.role as 'PATIENT' | 'DOCTOR',
      dbUserId: dbUser.id,
      token,
    };
    next();
  } catch (err: any) {
    if (err?.code === 'ACCOUNT_NOT_LINKED') return res.status(403).json({ message: err.message });
    next(err);
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
