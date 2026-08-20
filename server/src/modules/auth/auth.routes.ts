import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { authenticate } from '../../shared/middlewares/authenticate';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import type { AccountMailer } from '../../shared/notifications/mailer';
import { loginSchema, mfaChallengeSchema, mfaResendSchema } from './auth.schema';
import { AuthRepository } from './auth.repository';
import { RefreshTokenRepository } from './refreshToken.repository';
import { MfaRepository } from './mfa.repository';
import { AuthService } from './auth.service';
import { createAuthController } from './auth.controller';

export interface AuthRouterDeps {
  auditLogger: IAuditLogger;
  mailer: AccountMailer;
}

/**
 * Auth routes (login / me / refresh / logout), mounted under `/api/auth`. Built
 * as a factory (like the users/account routers) so the audit logger is injected
 * from `createApp`, keeping DI uniform and the audit sink test-substitutable.
 */
export function createAuthRouter(deps: AuthRouterDeps): Router {
  // Manual dependency injection: repositories → service → controller
  const authRepository = new AuthRepository();
  const refreshTokenRepository = new RefreshTokenRepository();
  const mfaRepository = new MfaRepository();
  const service = new AuthService(
    authRepository,
    refreshTokenRepository,
    mfaRepository,
    deps.auditLogger,
    deps.mailer,
  );
  const controller = createAuthController(service);

  const router = Router();
  router.post('/login', validateRequest(loginSchema), controller.login);
  router.get('/me', authenticate, controller.me);
  // NO `authenticate` here: with 15m access tokens the access cookie is usually
  // already expired at refresh time. The REFRESH cookie is the credential; the
  // service validates it against the DB (hash + not revoked/expired) and rotates.
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);

  // ── Email OTP 2FA (SECURITY_PRINCIPLES.md §3/§24) ──
  // Both steps are public: the short-lived `mfaToken` (issued by login) is the
  // bearer credential. challenge verifies the emailed code; resend re-sends it.
  // Both are rate-limited in app.ts (mfaVerify / mfaResend).
  router.post('/mfa/challenge', validateRequest(mfaChallengeSchema), controller.mfaChallenge);
  router.post('/mfa/resend', validateRequest(mfaResendSchema), controller.mfaResend);
  return router;
}
