/**
 * Centralized rate-limit policy catalog (SECURITY_PRINCIPLES.md §15 & §28).
 *
 * This is the single, reviewable source of truth for every rate-limit policy —
 * no scattered magic numbers. Each policy is a plain `{ windowMs, max }` config
 * consumed by the abstraction in `../security/rateLimit.ts` (which wraps the
 * maintained `express-rate-limit` library — we never hand-roll a limiter).
 *
 * All policies are WINDOW-BASED and therefore auto-reset: there are NO permanent
 * account lockouts an attacker could weaponize for DoS (§3, §15).
 *
 * Only policies whose endpoint EXISTS today are mounted (see `app.ts`). The
 * remaining policies are defined here, ready to mount, but are intentionally NOT
 * wired up — we do not add fake endpoints just to mount a policy. Mount each one
 * when its feature (MFA / password-reset / invitation) ships in a later batch.
 *
 * The two mounted policies (`login`, `refresh`) are additionally overridable per
 * environment via `RATE_LIMIT_*` variables read in `./env.ts`, so limits stay
 * reviewable and are tunable for production without code changes.
 */

const MINUTES = 60 * 1000;

export interface RateLimitPolicy {
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Max counted requests per key within the window before a 429 is returned. */
  max: number;
  /** Human-readable purpose — documentation only. */
  description: string;
}

/**
 * Default values for every named policy. Production-sane; the mounted policies
 * (`login*`, `refresh`) can be overridden per-environment (see `./env.ts`).
 */
export const RATE_LIMIT_DEFAULTS = {
  // --- Mounted today ---------------------------------------------------------
  /** Per-IP cap on login attempts (all outcomes). Primary brute-force brake. */
  loginIp: {
    windowMs: 15 * MINUTES,
    max: 30,
    description: 'POST /api/auth/login — per client IP, all attempts',
  },
  /**
   * Per (email+IP) cap counting only FAILED logins. Composing email WITH the IP
   * is the deliberate anti-account-DoS choice: an attacker from one IP cannot
   * lock a victim out globally, and successful logins never count toward it.
   */
  loginEmail: {
    windowMs: 15 * MINUTES,
    max: 8,
    description: 'POST /api/auth/login — per email+IP, failed attempts only',
  },
  /**
   * Per-EMAIL (IP-independent) cap counting only FAILED logins. This is the
   * defense against DISTRIBUTED attacks that spread many source IPs across a
   * single account: each IP can stay under `loginIp` (30) and `loginEmail` (8)
   * while collectively hammering one account — a gap the IP-composited limiters
   * cannot see. Keyed on the normalized email ALONE closes that gap.
   *
   * The threshold is deliberately WELL ABOVE `loginEmail` (8) — an email-only
   * key re-introduces the cross-IP account-DoS surface that `loginEmail`
   * composites the IP to avoid, so it must sit far above legitimate retry
   * behavior to bound how easily one account can be throttled. Like every
   * policy here it is WINDOW-BASED (auto-reset) — there is NO permanent lockout.
   */
  loginAccount: {
    windowMs: 15 * MINUTES,
    max: 25,
    description: 'POST /api/auth/login — per normalized email (all IPs), failed attempts only',
  },
  /** Per-IP cap on silent token renewals. */
  refresh: {
    windowMs: 15 * MINUTES,
    max: 60,
    description: 'POST /api/auth/refresh — per client IP',
  },

  // --- Defined but NOT mounted (no endpoint yet — mount in a later batch) -----
  mfaVerify: {
    windowMs: 15 * MINUTES,
    max: 5,
    description: 'FUTURE MFA verification — per account/IP (mount with the endpoint)',
  },
  mfaResend: {
    windowMs: 15 * MINUTES,
    max: 3,
    description: 'FUTURE MFA code resend — per account/IP (mount with the endpoint)',
  },
  forgotPassword: {
    windowMs: 60 * MINUTES,
    max: 5,
    description: 'FUTURE forgot-password request — per email+IP (mount with the endpoint)',
  },
  passwordReset: {
    windowMs: 60 * MINUTES,
    max: 5,
    description: 'FUTURE password-reset submit — per token/IP (mount with the endpoint)',
  },
  invitationActivation: {
    windowMs: 60 * MINUTES,
    max: 5,
    description: 'FUTURE invitation/activation redeem — per token/IP (mount with the endpoint)',
  },
  /**
   * Worker-document upload — per authenticated user. Bounds an expensive
   * operation (multipart parse + magic-byte sniff + encrypt + disk write), §14.
   * Mounted on POST /api/workers/:workerId/documents.
   */
  uploadDocument: {
    windowMs: 15 * MINUTES,
    max: 60,
    description: 'POST /api/workers/:workerId/documents — per authenticated user',
  },

  // --- Foreign-worker mobile login (SECURITY_PRINCIPLES.md §3/§15) -----------
  /**
   * Worker OTP start (qr/start, phone/start) — bounds how fast one source, or one
   * targeted identifier (qrToken/phone), can trigger outbound WhatsApp OTPs
   * (expensive + anti-bombing). Mounted as a per-IP + per-identifier+IP pair.
   */
  workerOtpStart: {
    windowMs: 15 * MINUTES,
    max: 10,
    description: 'POST /api/worker-auth/(qr|phone)/start — per IP and per identifier+IP',
  },
  /** Worker OTP verify — per IP, FAILED-only. Bounds brute-forcing the 6-digit code. */
  workerOtpVerify: {
    windowMs: 15 * MINUTES,
    max: 5,
    description: 'POST /api/worker-auth/verify — per IP, failed attempts only',
  },
  /** Worker OTP resend — per IP. Tighter, anti WhatsApp-bombing. */
  workerOtpResend: {
    windowMs: 15 * MINUTES,
    max: 3,
    description: 'POST /api/worker-auth/otp/resend — per IP',
  },
  /** Worker refresh — per IP. Silent token renewal for the worker session. */
  workerRefresh: {
    windowMs: 15 * MINUTES,
    max: 60,
    description: 'POST /api/worker-auth/refresh — per IP',
  },
  /** Worker request submission — per authenticated worker. Bounds spam/DoS on the inbox. */
  workerRequestSubmit: {
    windowMs: 15 * MINUTES,
    max: 30,
    description: 'POST /api/worker-portal/requests — per authenticated worker',
  },
} as const satisfies Record<string, RateLimitPolicy>;
