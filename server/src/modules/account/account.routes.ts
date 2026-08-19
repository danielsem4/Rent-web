import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import type { AccountMailer } from '../../shared/notifications/mailer';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './account.schema';
import { AccountRepository } from './account.repository';
import { AccountService } from './account.service';
import { createAccountController } from './account.controller';

export interface AccountRouterDeps {
  mailer: AccountMailer;
  clientUrl: string;
  auditLogger: IAuditLogger;
}

/**
 * Account-lifecycle routes, mounted under `/api/auth`. All three are UNAUTHENTICATED
 * (no session cookie) — the single-use token is the bearer secret, and CSRF's
 * Origin check only applies to cookie-bearing requests (`csrf.ts`). Rate limiters
 * for these paths are mounted in `app.ts`. Built as a factory because the mailer
 * and client URL are runtime config supplied by `createApp`.
 */
export function createAccountRouter(deps: AccountRouterDeps): Router {
  // Manual dependency injection: repository → service → controller.
  const repository = new AccountRepository();
  const service = new AccountService(repository, deps.mailer, deps.clientUrl, deps.auditLogger);
  const controller = createAccountController(service);

  const router = Router();
  router.post(
    '/invitation/accept',
    validateRequest(acceptInvitationSchema),
    controller.acceptInvitation,
  );
  router.post('/forgot-password', validateRequest(forgotPasswordSchema), controller.forgotPassword);
  router.post('/reset-password', validateRequest(resetPasswordSchema), controller.resetPassword);
  return router;
}
