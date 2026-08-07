import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  console.error('Unexpected error:', err);
  const detail = err instanceof Error ? err.message : String(err);
  res.status(500).json({ message: 'Internal server error', detail });
}
