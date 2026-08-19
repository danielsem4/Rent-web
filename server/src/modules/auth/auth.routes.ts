import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { authenticate } from '../../shared/middlewares/authenticate';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import { loginSchema } from './auth.schema';
import { AuthRepository } from './auth.repository';
import { RefreshTokenRepository } from './refreshToken.repository';
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
  const service = new AuthService(authRepository, refreshTokenRepository, deps.auditLogger);
  const controller = createAuthController(service);

  const router = Router();
  router.post('/login', validateRequest(loginSchema), controller.login);
  router.get('/me', authenticate, controller.me);
  // NO `authenticate` here: with 15m access tokens the access cookie is usually
  // already expired at refresh time. The REFRESH cookie is the credential; the
  // service validates it against the DB (hash + not revoked/expired) and rotates.
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  return router;
}
