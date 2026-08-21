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
import type { RateLimitPolicy } from '../config/rateLimit';

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

/**
 * Forgot-password limiter — per `email + IP`, like `loginEmail`. The key is derived
 * purely from `req.body`, so it behaves IDENTICALLY for existing and non-existing
 * emails (enumeration-safe). Compositing the IP avoids letting one attacker throttle
 * reset requests for a victim's address globally.
 */
export function createForgotPasswordRateLimiter(cfg: RateLimitConfig['forgotPassword']) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.windowMs,
    limit: cfg.max,
    keyGenerator: (req: Request): string =>
      `${normalizeEmail((req.body as { email?: unknown } | undefined)?.email)}|${ipKey(req)}`,
  });
}

/**
 * Reset-password & invitation-accept limiters — per client IP.
 *
 * Deliberately keyed on IP, NOT the token: keying on the token would hand an
 * attacker a FRESH bucket for every guessed value, making the limiter useless
 * against enumeration. A 256-bit random token is itself unguessable, so per-IP is
 * the meaningful abuse brake (bounding how fast one source can submit attempts).
 * This is a strengthening of the catalog's "per token/IP" note, never a weakening.
 */
export function createResetPasswordRateLimiter(cfg: RateLimitConfig['passwordReset']) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.windowMs,
    limit: cfg.max,
    keyGenerator: ipKey,
  });
}

export function createInvitationRateLimiter(cfg: RateLimitConfig['invitationActivation']) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.windowMs,
    limit: cfg.max,
    keyGenerator: ipKey,
  });
}

/**
 * MFA verification limiter (SECURITY_PRINCIPLES.md §15) — mounted on the MFA
 * second-factor endpoints. Keyed on `email + IP` when the request body carries an
 * email (challenge/verify requests are not email-bearing, so this degrades to
 * per-IP), counting only FAILED attempts (`skipSuccessfulRequests`) so a normal
 * successful verification never consumes the budget. Bounds brute-forcing a
 * 6-digit code; window-based (no permanent lockout).
 */
export function createMfaVerifyRateLimiter(cfg: RateLimitConfig['mfaVerify']) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.windowMs,
    limit: cfg.max,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request): string => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string' && email.trim() !== ''
        ? `${normalizeEmail(email)}|${ipKey(req)}`
        : ipKey(req);
    },
  });
}

/**
 * MFA code-resend limiter (SECURITY_PRINCIPLES.md §15) — mounted on the resend
 * endpoint. The resend body carries only an opaque `mfaToken` (no email), so this
 * is keyed per-IP to bound how fast one source can trigger outbound emails
 * (anti email-bombing). Tighter than `mfaVerify`; window-based (no permanent lockout).
 */
export function createMfaResendRateLimiter(cfg: RateLimitConfig['mfaResend']) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: cfg.windowMs,
    limit: cfg.max,
    keyGenerator: ipKey,
  });
}

/**
 * Worker-document upload limiter (SECURITY_PRINCIPLES.md §14/§15) — mounted AFTER
 * `authenticate`, so it keys on the authenticated user id (falling back to IP),
 * bounding how fast one account can drive the expensive upload path (multipart
 * parse + magic-byte sniff + encrypt + disk write). Window-based (no lockout).
 * Takes a policy object directly from the centralized catalog.
 */
export function createUploadRateLimiter(policy: RateLimitPolicy) {
  return rateLimit({
    ...BASE_OPTIONS,
    windowMs: policy.windowMs,
    limit: policy.max,
    keyGenerator: (req: Request): string => {
      const userId = req.currentUser?.userId;
      return userId != null ? `user:${userId}` : ipKey(req);
    },
  });
}
