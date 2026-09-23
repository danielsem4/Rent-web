import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import type { IAuditLogger } from '../../shared/audit/auditLogger';
import type { IWhatsAppSender } from '../../shared/notifications/whatsapp';
import { RATE_LIMIT_DEFAULTS } from '../../shared/config/rateLimit';
import {
  createWorkerOtpStartRateLimiters,
  createWorkerOtpVerifyRateLimiter,
  createWorkerOtpResendRateLimiter,
  createWorkerRefreshRateLimiter,
} from '../../shared/security/rateLimit';
import {
  qrStartSchema,
  phoneStartSchema,
  verifySchema,
  resendSchema,
  refreshSchema,
} from './workerAuth.schema';
import { WorkerAuthRepository } from './workerAuth.repository';
import { WorkerRefreshTokenRepository } from './workerRefreshToken.repository';
import { WorkerAuthService } from './workerAuth.service';
import { createWorkerAuthController } from './workerAuth.controller';

export interface WorkerAuthRouterDeps {
  auditLogger: IAuditLogger;
  /** WhatsApp OTP delivery seam (console in dev, real provider in prod). */
  whatsapp: IWhatsAppSender;
}

/**
 * Foreign-worker login routes, mounted under `/api/worker-auth`. A PARALLEL of the
 * staff auth router for the mobile principal — all endpoints are PUBLIC (pre-auth),
 * enumeration-safe, and rate-limited. The session is Bearer-transported (no cookies);
 * see `authenticateWorker` for the protected worker-portal side.
 *
 * Rate limiters are built fresh per `createApp()` (own in-memory store, test-isolated),
 * mirroring the upload limiter's inline pattern.
 */
export function createWorkerAuthRouter(deps: WorkerAuthRouterDeps): Router {
  // Manual dependency injection: repositories → service → controller.
  const repo = new WorkerAuthRepository();
  const refreshRepo = new WorkerRefreshTokenRepository();
  const service = new WorkerAuthService(repo, refreshRepo, deps.whatsapp, deps.auditLogger);
  const controller = createWorkerAuthController(service);

  const otpStartLimiters = createWorkerOtpStartRateLimiters(RATE_LIMIT_DEFAULTS.workerOtpStart);
  const otpVerifyLimiter = createWorkerOtpVerifyRateLimiter(RATE_LIMIT_DEFAULTS.workerOtpVerify);
  const otpResendLimiter = createWorkerOtpResendRateLimiter(RATE_LIMIT_DEFAULTS.workerOtpResend);
  const refreshLimiter = createWorkerRefreshRateLimiter(RATE_LIMIT_DEFAULTS.workerRefresh);

  const router = Router();

  // Identify → send WhatsApp OTP. Both start paths share the OTP-start limiter pair.
  router.post('/qr/start', ...otpStartLimiters, validateRequest(qrStartSchema), controller.qrStart);
  router.post(
    '/phone/start',
    ...otpStartLimiters,
    validateRequest(phoneStartSchema),
    controller.phoneStart,
  );
  // Verify the OTP → issue a Bearer session.
  router.post('/verify', otpVerifyLimiter, validateRequest(verifySchema), controller.verify);
  // Re-send the OTP for a pending login (anti-bombing limiter).
  router.post('/otp/resend', otpResendLimiter, validateRequest(resendSchema), controller.resend);
  // Rotate / revoke the worker session (refresh token in the body).
  router.post('/refresh', refreshLimiter, validateRequest(refreshSchema), controller.refresh);
  router.post('/logout', validateRequest(refreshSchema), controller.logout);

  return router;
}
