import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  sub: string;  // user id
  role: 'PATIENT' | 'DOCTOR';
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded === 'string' || !decoded.sub || !decoded.role) {
    throw new Error('Invalid token payload');
  }
  return { sub: decoded.sub as string, role: decoded.role as TokenPayload['role'] };
}