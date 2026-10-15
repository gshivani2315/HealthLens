import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  sub: string;  // user id (Prisma cuid or Supabase UUID)
  role: 'PATIENT' | 'DOCTOR';
  email?: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  // If Supabase JWT secret is configured, try Supabase JWT secret first, then fallback to jwtSecret
  const secretsToTry = [
    config.supabaseJwtSecret,
    config.jwtSecret,
  ].filter(Boolean) as string[];

  let lastError: Error | null = null;

  for (const secret of secretsToTry) {
    try {
      const decoded = jwt.verify(token, secret) as any;
      if (typeof decoded === 'string' || !decoded.sub) {
        continue;
      }

      // Handle role mapping:
      // 1. Direct role in payload (our backend issued or Supabase app_metadata)
      // 2. user_metadata.role from Supabase
      // 3. Defaults to PATIENT
      const rawRole =
        decoded.role ||
        decoded.app_metadata?.role ||
        decoded.user_metadata?.role ||
        'PATIENT';

      const role: 'PATIENT' | 'DOCTOR' =
        String(rawRole).toUpperCase() === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

      return {
        sub: decoded.sub,
        role,
        email: decoded.email,
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Invalid or expired token');
}