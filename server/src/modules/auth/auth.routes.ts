import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authenticateOrEnrollToken } from '../../shared/middlewares/mfaEnroll';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import {
  loginSchema,
  mfaChallengeSchema,
  mfaSetupSchema,
  mfaVerifySetupSchema,
  mfaDisableSchema,
} from './auth.schema';
import { AuthRepository } from './auth.repository';
import { RefreshTokenRepository } from './refreshToken.repository';
import { MfaRepository } from './mfa.repository';
import { AuthService } from './auth.service';
import { createAuthController } from './auth.controller';

export interface AuthRouterDeps {
  auditLogger: IAuditLogger;
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

  // ── MFA (SECURITY_PRINCIPLES.md §3/§24) ──
  // challenge: public second-factor step (the mfaToken is the bearer credential);
  // rate-limited in app.ts. setup/verify-setup: session OR enroll token (hard-gated
  // enrollment). disable: authenticated + step-up (password or TOTP) in the service.
  router.post('/mfa/challenge', validateRequest(mfaChallengeSchema), controller.mfaChallenge);
  router.post(
    '/mfa/setup',
    validateRequest(mfaSetupSchema),
    authenticateOrEnrollToken,
    controller.mfaSetup,
  );
  router.post(
    '/mfa/verify-setup',
    validateRequest(mfaVerifySetupSchema),
    authenticateOrEnrollToken,
    controller.mfaVerifySetup,
  );
  router.post('/mfa/disable', authenticate, validateRequest(mfaDisableSchema), controller.mfaDisable);
  return router;
}
