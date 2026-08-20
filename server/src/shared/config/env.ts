/**
 * Centralized startup configuration validation (SECURITY_PRINCIPLES.md §9/§25).
 *
 * `loadConfig` is a pure function of an environment object so it can be unit
 * tested without a process. `server/src/index.ts` calls it once at boot; in
 * production it FAILS FAST on missing / placeholder / weak / unsafe critical
 * configuration. Error messages name the offending variable(s) but NEVER print
 * a secret value.
 *
 * Dev/test are intentionally lenient (only `JWT_SECRET` presence is required) so
 * the mocked unit suite — which has no `DATABASE_URL` — keeps working.
 */

import { RATE_LIMIT_DEFAULTS } from './rateLimit';

/** Effective, per-environment rate-limit values for the MOUNTED policies. */
export interface RateLimitConfig {
  login: {
    ipWindowMs: number;
    ipMax: number;
    emailWindowMs: number;
    emailMax: number;
    accountWindowMs: number;
    accountMax: number;
  };
  refresh: {
    windowMs: number;
    max: number;
  };
  forgotPassword: {
    windowMs: number;
    max: number;
  };
  passwordReset: {
    windowMs: number;
    max: number;
  };
  invitationActivation: {
    windowMs: number;
    max: number;
  };
  mfaVerify: {
    windowMs: number;
    max: number;
  };
  mfaResend: {
    windowMs: number;
    max: number;
  };
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * SMTP delivery config for outbound mail (email-OTP 2FA, invitations, resets).
 * When absent, the app falls back to the console mailer (dev only — it fails
 * closed in production). Required as a complete set in production.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** From-address applied to every outbound message. */
  from: string;
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  databaseUrl: string | undefined;
  clientUrl: string | undefined;
  /**
   * SMTP delivery config (SECURITY_PRINCIPLES.md §7). `undefined` = no provider →
   * the console mailer is used (dev-only; it fails closed in production). Required
   * as a complete set in production so outbound mail (incl. the 2FA code) works.
   */
  smtp: SmtpConfig | undefined;
  /** Rate-limit policy values (SECURITY_PRINCIPLES.md §15/§28). */
  rateLimit: RateLimitConfig;
  /**
   * Minimum operational log level (SECURITY_PRINCIPLES.md §19). Defaults to
   * `info` in production, `debug` otherwise. The `logger` singleton reads this
   * from the environment directly; validating it here fails fast on a typo and
   * keeps it in the centralized config surface (§28).
   */
  logLevel: LogLevel;
  /**
   * Number of trusted reverse-proxy hops (`app.set('trust proxy', n)`).
   * `undefined` = OFF (secure default): `X-Forwarded-For` is ignored and
   * `req.ip` is the real socket peer, so a client cannot spoof its IP to evade
   * the per-IP rate limiters. Set to the exact hop count only when deployed
   * behind a known proxy/CDN (deployment-dependent — Needs Verification).
   */
  trustProxy: number | undefined;
}

/** Thrown when startup configuration is invalid. Message names variables only. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Values that must never be accepted as a real secret in production. Compared
 * case-insensitively; any secret CONTAINING one of these is rejected too (so
 * `my-change-me-in-production` is also refused).
 */
const PLACEHOLDER_SECRETS = [
  'change-me-in-production',
  'dev-secret-change-me',
  'changeme',
  'change-me',
  'placeholder',
  'password',
  'secret',
  'test-secret',
  'your-secret-here',
];

function isPlaceholder(secret: string): boolean {
  const lower = secret.toLowerCase();
  return PLACEHOLDER_SECRETS.some((p) => lower.includes(p));
}

/**
 * Validate and normalize environment configuration.
 *
 * @throws {ConfigError} in production when critical configuration is unsafe.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = env['JWT_SECRET'];
  const databaseUrl = env['DATABASE_URL'];
  const clientUrl = env['CLIENT_URL'];
  const rawPort = env['PORT'];

  const errors: string[] = [];

  // JWT_SECRET — required everywhere; strong + non-placeholder in production.
  if (!jwtSecret || jwtSecret.length === 0) {
    errors.push('JWT_SECRET is required');
  } else if (isProduction) {
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      errors.push(`JWT_SECRET is too weak (must be at least ${MIN_JWT_SECRET_LENGTH} characters)`);
    }
    if (isPlaceholder(jwtSecret)) {
      errors.push('JWT_SECRET is a known placeholder/insecure value and must be replaced');
    }
  }

  // Production-only requirements for critical infrastructure/config.
  if (isProduction) {
    if (!databaseUrl || databaseUrl.length === 0) {
      errors.push('DATABASE_URL is required in production');
    }
    if (!clientUrl || clientUrl.length === 0) {
      errors.push('CLIENT_URL is required in production (no localhost fallback)');
    } else if (/localhost|127\.0\.0\.1/i.test(clientUrl)) {
      errors.push('CLIENT_URL must not point at localhost in production');
    }
  }

  // PORT — optional; if provided it must be a valid port number.
  let port = 5001;
  if (rawPort !== undefined && rawPort !== '') {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      errors.push('PORT must be a valid port number');
    } else {
      port = parsed;
    }
  }

  // Rate-limit values — overridable per environment, defaulting to the central
  // catalog. A positive integer is required when provided; anything else is an
  // error (fail closed rather than silently applying an unbounded/zero limit).
  const rl = RATE_LIMIT_DEFAULTS;
  const rateLimit: RateLimitConfig = {
    login: {
      ipWindowMs: readPositiveInt(env, 'RATE_LIMIT_LOGIN_IP_WINDOW_MS', rl.loginIp.windowMs, errors),
      ipMax: readPositiveInt(env, 'RATE_LIMIT_LOGIN_IP_MAX', rl.loginIp.max, errors),
      emailWindowMs: readPositiveInt(
        env,
        'RATE_LIMIT_LOGIN_EMAIL_WINDOW_MS',
        rl.loginEmail.windowMs,
        errors,
      ),
      emailMax: readPositiveInt(env, 'RATE_LIMIT_LOGIN_EMAIL_MAX', rl.loginEmail.max, errors),
      accountWindowMs: readPositiveInt(
        env,
        'RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_MS',
        rl.loginAccount.windowMs,
        errors,
      ),
      accountMax: readPositiveInt(env, 'RATE_LIMIT_LOGIN_ACCOUNT_MAX', rl.loginAccount.max, errors),
    },
    refresh: {
      windowMs: readPositiveInt(env, 'RATE_LIMIT_REFRESH_WINDOW_MS', rl.refresh.windowMs, errors),
      max: readPositiveInt(env, 'RATE_LIMIT_REFRESH_MAX', rl.refresh.max, errors),
    },
    forgotPassword: {
      windowMs: readPositiveInt(
        env,
        'RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS',
        rl.forgotPassword.windowMs,
        errors,
      ),
      max: readPositiveInt(env, 'RATE_LIMIT_FORGOT_PASSWORD_MAX', rl.forgotPassword.max, errors),
    },
    passwordReset: {
      windowMs: readPositiveInt(
        env,
        'RATE_LIMIT_PASSWORD_RESET_WINDOW_MS',
        rl.passwordReset.windowMs,
        errors,
      ),
      max: readPositiveInt(env, 'RATE_LIMIT_PASSWORD_RESET_MAX', rl.passwordReset.max, errors),
    },
    invitationActivation: {
      windowMs: readPositiveInt(
        env,
        'RATE_LIMIT_INVITATION_WINDOW_MS',
        rl.invitationActivation.windowMs,
        errors,
      ),
      max: readPositiveInt(env, 'RATE_LIMIT_INVITATION_MAX', rl.invitationActivation.max, errors),
    },
    mfaVerify: {
      windowMs: readPositiveInt(env, 'RATE_LIMIT_MFA_VERIFY_WINDOW_MS', rl.mfaVerify.windowMs, errors),
      max: readPositiveInt(env, 'RATE_LIMIT_MFA_VERIFY_MAX', rl.mfaVerify.max, errors),
    },
    mfaResend: {
      windowMs: readPositiveInt(env, 'RATE_LIMIT_MFA_RESEND_WINDOW_MS', rl.mfaResend.windowMs, errors),
      max: readPositiveInt(env, 'RATE_LIMIT_MFA_RESEND_MAX', rl.mfaResend.max, errors),
    },
  };

  // SMTP — outbound mail provider. Absent => console mailer (dev only). In
  // production the full set is required (fail closed rather than silently dropping
  // the 2FA code / invitations). Validated as a complete group.
  const smtp = readSmtpConfig(env, isProduction, errors);

  // TRUST_PROXY — optional. Absent => undefined (OFF, secure default). When
  // present it must be a positive integer hop count (fail closed otherwise); we
  // never accept `true`, which would let any client spoof X-Forwarded-For.
  const trustProxy = readOptionalPositiveInt(env, 'TRUST_PROXY', errors);

  // LOG_LEVEL — optional; must be a known level when provided (fail closed on a
  // typo rather than silently falling back). Defaults by environment.
  const logLevel = readLogLevel(env, isProduction ? 'info' : 'debug', errors);

  if (errors.length > 0) {
    // Names only — never the offending values.
    throw new ConfigError(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    nodeEnv,
    isProduction,
    port,
    // Presence guaranteed above (JWT_SECRET) / allowed-absent in dev.
    jwtSecret: jwtSecret as string,
    databaseUrl,
    clientUrl,
    smtp,
    rateLimit,
    trustProxy,
    logLevel,
  };
}

/**
 * Read SMTP config as a complete group. Returns `undefined` when NO `SMTP_*` var
 * is set (dev falls back to the console mailer). If any is set, all of
 * `SMTP_HOST/PORT/USER/PASS` + `MAIL_FROM` must be present and valid. In production
 * the full set is mandatory even if none is provided (fail closed).
 */
function readSmtpConfig(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
  errors: string[],
): SmtpConfig | undefined {
  const host = env['SMTP_HOST'];
  const rawPort = env['SMTP_PORT'];
  const user = env['SMTP_USER'];
  const pass = env['SMTP_PASS'];
  const from = env['MAIL_FROM'];

  const anySet = [host, rawPort, user, pass, from].some((v) => v !== undefined && v !== '');
  if (!anySet) {
    if (isProduction) {
      errors.push('SMTP configuration (SMTP_HOST/PORT/USER/PASS, MAIL_FROM) is required in production');
    }
    return undefined;
  }

  const port = Number(rawPort);
  if (!host) errors.push('SMTP_HOST is required when SMTP is configured');
  if (rawPort === undefined || rawPort === '' || !Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push('SMTP_PORT must be a valid port number when SMTP is configured');
  }
  if (!user) errors.push('SMTP_USER is required when SMTP is configured');
  if (!pass) errors.push('SMTP_PASS is required when SMTP is configured');
  if (!from) errors.push('MAIL_FROM is required when SMTP is configured');

  if (!host || !user || !pass || !from || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return undefined;
  }
  return { host, port, user, pass, from };
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

/**
 * Read an optional log level. Falls back to `fallback` when unset/empty; pushes
 * a (value-free) error when present but not a recognized level.
 */
function readLogLevel(env: NodeJS.ProcessEnv, fallback: LogLevel, errors: string[]): LogLevel {
  const raw = env['LOG_LEVEL'];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    errors.push(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
    return fallback;
  }
  return raw as LogLevel;
}

/**
 * Read an optional positive-integer env var. Falls back to `fallback` when unset
 * or empty; pushes a (value-free) error when present but not a positive integer.
 */
function readPositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  errors: string[],
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return fallback;
  }
  return parsed;
}

/**
 * Read an optional positive-integer env var with NO numeric fallback: returns
 * `undefined` when unset/empty, or pushes a (value-free) error when present but
 * not a positive integer. Used for `TRUST_PROXY`, where "absent" is a distinct,
 * meaningful state (proxy trust OFF) rather than a default count.
 */
function readOptionalPositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  errors: string[],
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return undefined;
  }
  return parsed;
}
