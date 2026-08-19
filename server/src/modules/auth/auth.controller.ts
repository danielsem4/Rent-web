import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from './auth.service';
import type { LoginDto } from './auth.schema';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  AUTH_COOKIE_CLEAR_OPTIONS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
  REFRESH_COOKIE_CLEAR_OPTIONS,
} from '../../shared/utils/cookie';

/** Clear BOTH auth cookies (must use the same path/attrs the cookies were set with). */
function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_CLEAR_OPTIONS);
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_CLEAR_OPTIONS);
}

export function createAuthController(service: AuthService) {
  return {
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const result = await service.login(req.body as LoginDto, buildAuditContext(req));
        res.cookie(AUTH_COOKIE_NAME, result.accessToken, AUTH_COOKIE_OPTIONS);
        res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
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
        const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
        const tokens = await service.refresh(rawRefresh, buildAuditContext(req));
        res.cookie(AUTH_COOKIE_NAME, tokens.accessToken, AUTH_COOKIE_OPTIONS);
        res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
        res.json({ message: 'Token refreshed' });
      } catch (err) {
        // Any refresh failure (unknown/revoked/expired/disabled) clears both
        // cookies so the browser drops the dead session and the client falls back
        // to login (its interceptor treats a non-2xx refresh as session-expired).
        clearAuthCookies(res);
        next(err);
      }
    },

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
        await service.logout(rawRefresh, buildAuditContext(req));
        clearAuthCookies(res);
        res.json({ message: 'Logged out' });
      } catch (err) {
        next(err);
      }
    },
  };
}
