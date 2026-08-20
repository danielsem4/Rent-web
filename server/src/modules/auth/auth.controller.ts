import type { Request, Response, NextFunction } from 'express';
import type { AuthService, SessionTokens } from './auth.service';
import type { LoginDto, MfaChallengeDto, MfaResendDto } from './auth.schema';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  AUTH_COOKIE_CLEAR_OPTIONS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
  REFRESH_COOKIE_CLEAR_OPTIONS,
} from '../../shared/utils/cookie';

/** Set BOTH auth cookies for a freshly minted session. */
function setSessionCookies(res: Response, tokens: SessionTokens): void {
  res.cookie(AUTH_COOKIE_NAME, tokens.accessToken, AUTH_COOKIE_OPTIONS);
  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
}

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
        if (result.kind === 'session') {
          setSessionCookies(res, result.tokens);
          res.json({ user: result.user });
          return;
        }
        // Second factor required — NO session cookies yet. A one-time code was
        // emailed; the client posts the mfaToken + code to /mfa/challenge.
        res.json({ mfaRequired: true, mfaToken: result.mfaToken });
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
        setSessionCookies(res, tokens);
        res.json({ message: 'Token refreshed' });
      } catch (err) {
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

    // ── MFA ──────────────────────────────────────────────────────────────────

    /** Second-factor login: verify the emailed code and issue the real session cookies. */
    async mfaChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { mfaToken, code } = req.body as MfaChallengeDto;
        const result = await service.completeMfaChallenge(mfaToken, code, buildAuditContext(req));
        setSessionCookies(res, result.tokens);
        res.json({ user: result.user });
      } catch (err) {
        next(err);
      }
    },

    /** Re-send the emailed code and return a fresh challenge token. */
    async mfaResend(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { mfaToken } = req.body as MfaResendDto;
        const result = await service.resendMfaCode(mfaToken, buildAuditContext(req));
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  };
}
