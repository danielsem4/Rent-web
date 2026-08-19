import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { Role } from '../constants/roles';

/**
 * Role-gate factory. Use AFTER `authenticate`:
 *   router.get('/', authenticate, authorize(Role.COMPANY_MANAGER, Role.SUPER_ADMIN), handler)
 */
export function authorize(...roles: Role[]) {
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
