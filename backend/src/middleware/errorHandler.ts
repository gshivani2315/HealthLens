import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error && status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ message });
}