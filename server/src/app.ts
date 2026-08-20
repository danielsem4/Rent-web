import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createUsersRouter } from './modules/users/users.routes';
import { createAccountRouter } from './modules/account/account.routes';
import { errorHandler } from './shared/middlewares/errorHandler';
import { requestContext } from './shared/middlewares/requestContext';
import { requestLogger } from './shared/middlewares/requestLogger';
import { csrfOriginCheck } from './shared/middlewares/csrf';
import { AuditService } from './shared/audit/audit.service';
import { AuditLogRepository } from './shared/audit/audit.repository';
import type { IAuditLogger } from './shared/audit/auditLogger';
import {
  createLoginRateLimiters,
  createRefreshRateLimiter,
  createForgotPasswordRateLimiter,
  createResetPasswordRateLimiter,
  createInvitationRateLimiter,
  createMfaVerifyRateLimiter,
} from './shared/security/rateLimit';
import { ConsoleAccountMailer, type AccountMailer } from './shared/notifications/mailer';
import { loadConfig, type AppConfig } from './shared/config/env';

/** Optional overrides for tests (e.g. a capturing mailer or audit logger). */
export interface AppOverrides {
  mailer?: AccountMailer;
  auditLogger?: IAuditLogger;
}

/**
 * Builds and configures the Express application.
 *
 * Middleware order is intentional and must not change:
 *   helmet → cors(credentials) → cookieParser → json → urlencoded
 *   → CSRF origin check → per-route rate limiters
 *   → /api/health → module routers → errorHandler (LAST).
 *
 * Rate limiters and the CSRF check are built FRESH per `createApp()` call, from
 * the validated `config`. That keeps each in-memory limiter store isolated (so
 * tests don't leak state) and routes every security value through one config.
 *
 * This factory has NO side effects (it does not call `listen`), so it can be
 * mounted directly by Supertest in tests. The process bootstrap lives in
 * `index.ts`.
 */
export function createApp(
  config: AppConfig = loadConfig(),
  overrides: AppOverrides = {},
): Application {
  const app = express();

  // Trust proxy (SECURITY_PRINCIPLES.md §15) — deployment-dependent, OFF by
  // default (secure). When unset, `X-Forwarded-For` is IGNORED and `req.ip` is
  // the real socket peer, so a client cannot spoof its IP to evade the per-IP
  // rate limiters. Production sets the EXACT trusted hop count (a positive
  // integer — never `true`) via `TRUST_PROXY` for the chosen proxy/CDN topology.
  if (config.trustProxy != null) {
    app.set('trust proxy', config.trustProxy);
  }

  // The single validated allowed origin — shared by CORS and the CSRF check.
  const allowedOrigin = config.clientUrl ?? 'http://localhost:5173';

  // Request correlation + operational logging (SECURITY_PRINCIPLES.md §19).
  // First so every downstream log line carries a `requestId`; after `trust proxy`
  // so `req.ip` (logged by requestLogger) reflects the configured proxy trust.
  app.use(requestContext);
  app.use(requestLogger);

  // Middleware
  app.use(helmet());
  app.use(
    cors({
      // One authoritative config path (SECURITY_PRINCIPLES.md §9/§25): the origin
      // comes from the validated config, never straight from process.env. In
      // production `loadConfig` guarantees `clientUrl` is present and non-localhost,
      // so this can NEVER silently fall back to localhost in prod.
      origin: allowedOrigin,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CSRF (SECURITY_PRINCIPLES.md §13) — server-side Origin/Referer validation on
  // authenticated state-changing requests. CORS is NOT CSRF protection. Runs
  // after cookieParser/body parsers so it can read the auth cookie, and before
  // the routers so it fails closed early.
  app.use(csrfOriginCheck(allowedOrigin));

  // Rate limiting (SECURITY_PRINCIPLES.md §15) — mounted only on endpoints that
  // exist today. Login gets three layered limiters (per-IP all-attempts, per
  // email+IP failed-only, and per-email failed-only to catch distributed attacks);
  // refresh gets a per-IP limiter. Placed before the routers so floods are
  // rejected cheaply, after body parsing so the email key can read req.body.
  app.use('/api/auth/login', ...createLoginRateLimiters(config.rateLimit.login));
  app.use('/api/auth/refresh', createRefreshRateLimiter(config.rateLimit.refresh));
  // Account-lifecycle limiters (SECURITY_PRINCIPLES.md §15). forgot-password keys
  // on email+IP (enumeration-safe, body-derived); reset/invitation key on IP —
  // see `security/rateLimit.ts` for why per-IP (not per-token) is the meaningful
  // brake against token guessing.
  app.use('/api/auth/forgot-password', createForgotPasswordRateLimiter(config.rateLimit.forgotPassword));
  app.use('/api/auth/reset-password', createResetPasswordRateLimiter(config.rateLimit.passwordReset));
  app.use(
    '/api/auth/invitation/accept',
    createInvitationRateLimiter(config.rateLimit.invitationActivation),
  );
  // MFA second-factor endpoints (SECURITY_PRINCIPLES.md §15) — throttle code
  // guessing on the challenge and enrollment-verify steps. Fresh limiter per
  // createApp() (own in-memory store) like the others.
  app.use('/api/auth/mfa/challenge', createMfaVerifyRateLimiter(config.rateLimit.mfaVerify));
  app.use('/api/auth/mfa/verify-setup', createMfaVerifyRateLimiter(config.rateLimit.mfaVerify));

  // Health check route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Account-mail delivery seam. Dev default logs the link (non-prod only); tests
  // may inject a capturing mailer. Client URL reuses the single validated origin.
  const mailer = overrides.mailer ?? new ConsoleAccountMailer();

  // Audit logging seam (SECURITY_PRINCIPLES.md §18). Default persists to the
  // AuditLog table; tests may inject a capturing/no-op logger. Built once and
  // shared across the routers (it is stateless — the repository goes through the
  // prisma singleton). Resilient: a write failure never breaks a request.
  const auditLogger = overrides.auditLogger ?? new AuditService(new AuditLogRepository());

  // Module routes. The account router mounts additional POST endpoints under
  // /api/auth (invitation/accept, forgot-password, reset-password).
  app.use('/api/auth', createAuthRouter({ auditLogger }));
  app.use('/api/auth', createAccountRouter({ mailer, clientUrl: allowedOrigin, auditLogger }));
  app.use('/api/users', createUsersRouter({ mailer, clientUrl: allowedOrigin, auditLogger }));

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
