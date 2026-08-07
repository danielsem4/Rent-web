import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Role-gate factory. Use AFTER `authenticate`:
 *   router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), handler)
 */
export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const current = req.currentUser;
    if (!current) {
      next(new AppError('Authentication required', 401));
      return;
    }
    if (roles.length > 0 && !roles.includes(current.role)) {
      next(new AppError('Forbidden', 403));
      return;
    }
    next();
  };
}
