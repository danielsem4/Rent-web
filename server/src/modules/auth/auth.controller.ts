import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from './auth.service';
import type { LoginDto } from './auth.schema';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  AUTH_COOKIE_CLEAR_OPTIONS,
} from '../../shared/utils/cookie';

export function createAuthController(service: AuthService) {
  return {
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const result = await service.login(req.body as LoginDto);
        res.cookie(AUTH_COOKIE_NAME, result.token, AUTH_COOKIE_OPTIONS);
        res.json({ user: result.user });
      } catch (err) {
        next(err);
      }
    },

    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const user = await service.getMe(req.currentUser!.userId);
        res.json({ user });
      } catch (err) {
        next(err);
      }
    },

    async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { userId, role } = req.currentUser!;
        const { token } = service.refresh(userId, role);
        res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
        res.json({ message: 'Token refreshed' });
      } catch (err) {
        next(err);
      }
    },

    async logout(_req: Request, res: Response): Promise<void> {
      res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_CLEAR_OPTIONS);
      res.json({ message: 'Logged out' });
    },
  };
}
