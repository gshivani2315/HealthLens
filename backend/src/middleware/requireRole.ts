import type { Request, Response, NextFunction } from 'express';
import type { TokenPayload } from '../lib/jwt';

export function requireRole(...roles: TokenPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}