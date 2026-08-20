import type { Request, Response, NextFunction } from 'express';
import type { AuthService, SessionTokens } from './auth.service';
import type {
  LoginDto,
  MfaChallengeDto,
  MfaVerifySetupDto,
  MfaDisableDto,
} from './auth.schema';
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
        // Second factor required — NO session cookies yet. The client posts the
        // mfaToken (+ code) to /mfa/challenge, or /mfa/setup when setup is required.
        res.json({
          mfaRequired: true,
          mfaToken: result.mfaToken,
          ...(result.setupRequired ? { mfaSetupRequired: true } : {}),
        });
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

    /** Second-factor login: verify the code and issue the real session cookies. */
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

    /** Begin enrollment: returns otpauth URI + QR + one-time recovery codes. */
    async mfaSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const data = await service.beginMfaSetup(req.mfaUserId!);
        res.json(data);
      } catch (err) {
        next(err);
      }
    },

    /** Complete enrollment. When reached via an enroll token, issue a session. */
    async mfaVerifySetup(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { code } = req.body as MfaVerifySetupDto;
        const result = await service.completeMfaSetup(
          req.mfaUserId!,
          code,
          buildAuditContext(req),
          req.mfaEnrollMode === true,
        );
        if (result) {
          setSessionCookies(res, result.tokens);
          res.json({ user: result.user, enabled: true });
          return;
        }
        res.json({ enabled: true });
      } catch (err) {
        next(err);
      }
    },

    /** Disable MFA after a step-up check (current password or a TOTP code). */
    async mfaDisable(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { password, code } = req.body as MfaDisableDto;
        await service.disableMfa(
          req.currentUser!.userId,
          { password, code },
          buildAuditContext(req),
        );
        res.json({ disabled: true });
      } catch (err) {
        next(err);
      }
    },
  };
}
