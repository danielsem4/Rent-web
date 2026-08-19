import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { errorHandler } from './shared/middlewares/errorHandler';
import { csrfOriginCheck } from './shared/middlewares/csrf';
import {
  createLoginRateLimiters,
  createRefreshRateLimiter,
} from './shared/security/rateLimit';
import { loadConfig, type AppConfig } from './shared/config/env';

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
export function createApp(config: AppConfig = loadConfig()): Application {
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

  // Health check route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Module routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
