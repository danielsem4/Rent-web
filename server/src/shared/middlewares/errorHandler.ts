import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../logging/logger';

/**
 * Centralized error handler (registered last).
 *
 * Operational `AppError`s carry a safe, intentional public message + status.
 * Everything else is an UNEXPECTED error: it is logged in full server-side but
 * the client receives a generic response. In production the body is exactly
 * `{ message: 'Internal server error' }` — never `err.message`, a stack trace,
 * Prisma/DB internals, filesystem paths, or environment values
 * (SECURITY_PRINCIPLES.md §14). A `detail` field is included ONLY outside
 * production, purely as a developer-experience aid.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  // Full detail stays server-side only, in a structured log correlated by
  // requestId. `redact()` (inside the logger) scrubs any sensitive fields the
  // error object might carry.
  logger.error('unhandled_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    err,
  });

  const body: { message: string; detail?: string } = { message: 'Internal server error' };
  if (process.env['NODE_ENV'] !== 'production') {
    body.detail = err instanceof Error ? err.message : String(err);
  }
  res.status(500).json(body);
}
