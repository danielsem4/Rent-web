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

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  databaseUrl: string | undefined;
  clientUrl: string | undefined;
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
  };
}
