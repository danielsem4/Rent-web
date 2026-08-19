/**
 * Rate-limiting abstraction (SECURITY_PRINCIPLES.md §15).
 *
 * A thin, reusable wrapper around the maintained `express-rate-limit` library —
 * we never hand-roll a limiter. Policy VALUES live in `../config/rateLimit.ts`
 * (and are environment-overridable via `../config/env.ts`); this module only
 * turns a policy into middleware and enforces our house rules:
 *
 *   - standardized, generic `429` body (no account disclosure, no internals);
 *   - RFC `RateLimit` headers (`draft-7`), no legacy `X-RateLimit-*`;
 *   - IP keys normalized for IPv6 via the library's `ipKeyGenerator`.
 *
 * Dev/tests use the default in-memory store (per-process). A multi-instance
 * production deployment needs a shared store (e.g. Redis) — that is
 * deployment-dependent and remains Needs Verification.
 */

import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { RateLimitConfig } from '../config/env';

/** Generic throttle message — identical regardless of account existence. */
export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests, please try again later.';

/** House defaults applied to every limiter. */
const BASE_OPTIONS: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Respond directly with our standard `{ message }` shape and a safe status.
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ message: TOO_MANY_REQUESTS_MESSAGE });
  },
};

/** Normalize an email for keying: trimmed + lowercased; non-strings → 'unknown'. */
function normalizeEmail(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : 'unknown';
}

/** IPv6-safe client-IP key. */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

/**
 * Login limiters — a defense-in-depth trio mounted together on the login route:
 *
 *  1. `ipLimiter`     — per client IP, counts ALL attempts. Primary brute-force /
 *     credential-stuffing brake.
 *  2. `emailLimiter`  — per `email + IP`, counts only FAILED logins
 *     (`skipSuccessfulRequests`). Compositing the email WITH the IP is the
 *     deliberate anti-account-DoS choice: an attacker from one IP cannot lock a
 *     victim out globally, and a legitimate user's successful login never counts.
 *  3. `accountLimiter`— per NORMALIZED EMAIL alone (IP-independent), counts only
 *     FAILED logins. This is what stops a DISTRIBUTED attack: many source IPs,
 *     each staying under `ipLimiter` and `emailLimiter`, still converge on one
 *     account — invisible to the IP-composited limiters above. Its threshold is
 *     set WELL ABOVE `emailLimiter` (see `config/rateLimit.ts`) precisely because
 *     an email-only key re-opens the cross-IP account-DoS surface that (2) avoids.
 *
 * All three are window-based (auto-reset) — NO permanent lockout. The 429 body is
 * the generic `TOO_MANY_REQUESTS_MESSAGE`, and both email keys are derived purely
 * from `req.body` so they behave identically for existing and non-existing
 * accounts (enumeration-safe).
 */
export function createLoginRateLimiters(cfg: RateLimitConfig['login']) {
  const ipLimiter = rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.ipWindowMs,
    limit: cfg.ipMax,
    keyGenerator: ipKey,
  });

  const emailLimiter = rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.emailWindowMs,
    limit: cfg.emailMax,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request): string =>
      `${normalizeEmail((req.body as { email?: unknown } | undefined)?.email)}|${ipKey(req)}`,
  });

  const accountLimiter = rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.accountWindowMs,
    limit: cfg.accountMax,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request): string =>
      normalizeEmail((req.body as { email?: unknown } | undefined)?.email),
  });

  return [ipLimiter, emailLimiter, accountLimiter] as const;
}

/** Refresh limiter — per client IP. */
export function createRefreshRateLimiter(cfg: RateLimitConfig['refresh']) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.windowMs,
    limit: cfg.max,
    keyGenerator: ipKey,
  });
}
