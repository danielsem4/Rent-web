/**
 * Structured operational logger (SECURITY_PRINCIPLES.md §19).
 *
 * Operational logs and audit logs are SEPARATE concerns: this logger is for
 * operational events (startup, HTTP lifecycle, unexpected errors, delivery
 * failures); security events go to the durable audit trail (`shared/audit`).
 *
 * Dependency-free by design (§21 — avoid unnecessary dependencies). Output is a
 * single line per event: compact JSON in production, a human-readable line in
 * development. Every logged `context` is passed through `redact()` so secrets can
 * never leak into logs (§7/§18) — the SAME redaction primitive the audit
 * sanitizer reuses.
 *
 * A module-level `logger` singleton is configured from `process.env`
 * (`NODE_ENV`, `LOG_LEVEL`) at import, so any layer can log without threading
 * config through it (mirrors how `errorHandler`/`mailer` read `process.env`).
 * `createLogger` is exported for tests (inject a sink to capture output).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Numeric ordering for level filtering. `silent` disables all output. */
const LEVEL_ORDER: Record<LogLevel | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'silent']);

/**
 * Keys whose VALUES must never appear in logs. Matched case-insensitively as a
 * substring so `passwordHash`, `tokenHash`, `resetToken`, `X-Api-Key`, etc. are
 * all caught. Kept deliberately broad — a false-positive redaction is safe; a
 * leaked secret is not (§7/§18).
 */
const SENSITIVE_KEY = /pass|token|secret|cookie|jwt|authorization|credential|api[-_]?key|otp/i;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

/**
 * Return a deep, log-safe copy of `value`: any object key matching
 * `SENSITIVE_KEY` has its value replaced with `[REDACTED]`. Recurses into nested
 * objects/arrays (depth-capped) and normalizes `Error` instances (which carry
 * their fields non-enumerably) to `{ name, message, stack }`. Never mutates the
 * input.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return '[TRUNCATED]';
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to `info` (prod) / `debug` (dev). */
  level?: LogLevel | 'silent';
  /** Human-readable single line (dev) vs compact JSON (prod). Defaults by NODE_ENV. */
  pretty?: boolean;
  /**
   * Where a formatted line goes. Defaults to `process.stderr` for warn/error and
   * `process.stdout` otherwise. Tests inject a capturing sink. Using the streams
   * directly (not `console.*`) keeps the app free of ad-hoc console usage (§19).
   */
  sink?: (level: LogLevel, line: string) => void;
}

function defaultSink(level: LogLevel, line: string): void {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

function normalizeLevel(raw: string | undefined, fallback: LogLevel): LogLevel | 'silent' {
  if (raw && VALID_LEVELS.has(raw)) {
    return raw as LogLevel | 'silent';
  }
  return fallback;
}

function formatPretty(
  ts: string,
  level: LogLevel,
  msg: string,
  context: Record<string, unknown>,
): string {
  // "HH:MM:SS.mmm LEVEL msg key=value key=value"
  const time = ts.slice(11, 23);
  const pairs = Object.entries(context)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  const suffix = pairs ? ` ${pairs}` : '';
  return `${time} ${level.toUpperCase().padEnd(5)} ${msg}${suffix}`;
}

interface ResolvedConfig {
  threshold: number;
  pretty: boolean;
  sink: (level: LogLevel, line: string) => void;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  // Resolve env-derived config LAZILY (memoized on first use). The `logger`
  // singleton is created at import — before `index.ts` runs `dotenv.config()` —
  // so reading NODE_ENV/LOG_LEVEL here (rather than at construction) ensures the
  // values from `.env` are in place. Explicit `opts` bypass the environment
  // entirely, keeping tests deterministic.
  let resolved: ResolvedConfig | undefined;
  function config(): ResolvedConfig {
    if (!resolved) {
      const nodeEnv = process.env['NODE_ENV'] ?? 'development';
      const isProduction = nodeEnv === 'production';
      const level =
        opts.level ?? normalizeLevel(process.env['LOG_LEVEL'], isProduction ? 'info' : 'debug');
      resolved = {
        threshold: LEVEL_ORDER[level],
        pretty: opts.pretty ?? !isProduction,
        sink: opts.sink ?? defaultSink,
      };
    }
    return resolved;
  }

  function emit(logLevel: LogLevel, msg: string, context?: Record<string, unknown>): void {
    const { threshold, pretty, sink } = config();
    if (LEVEL_ORDER[logLevel] < threshold) {
      return;
    }
    const safeContext = (context ? redact(context) : {}) as Record<string, unknown>;
    const ts = new Date().toISOString();
    const line = pretty
      ? formatPretty(ts, logLevel, msg, safeContext)
      : JSON.stringify({ ts, level: logLevel, msg, ...safeContext });
    sink(logLevel, line);
  }

  return {
    debug: (msg, context) => emit('debug', msg, context),
    info: (msg, context) => emit('info', msg, context),
    warn: (msg, context) => emit('warn', msg, context),
    error: (msg, context) => emit('error', msg, context),
  };
}

/** Process-wide operational logger, configured from the environment at import. */
export const logger = createLogger();
