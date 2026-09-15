import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../src/shared/config/env';

// A configuration that is valid for production, used as a baseline to mutate.
const STRONG_SECRET = 'x7Kd9Qp2Rm5Tn8Vb1Wc4Ye6Zg0Hj3Lo9Su2Ad5Fh8'; // 40+ chars, not a placeholder
const STRONG_FIELD_KEY = 'f'.repeat(64); // 64 hex chars = 32 bytes
const validProd = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: STRONG_SECRET,
  FIELD_ENCRYPTION_KEY: STRONG_FIELD_KEY,
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/rentplus',
  CLIENT_URL: 'https://app.rentplus.example',
  PORT: '5001',
  // SMTP is required as a complete set in production (outbound mail incl. 2FA code).
  SMTP_HOST: 'smtp.rentplus.example',
  SMTP_PORT: '587',
  SMTP_USER: 'mailer',
  SMTP_PASS: 'mailer-pass',
  MAIL_FROM: 'no-reply@rentplus.example',
});

describe('loadConfig — production fail-fast', () => {
  it('accepts a complete, strong production configuration', () => {
    const cfg = loadConfig(validProd());
    expect(cfg.isProduction).toBe(true);
    expect(cfg.port).toBe(5001);
    expect(cfg.jwtSecret).toBe(STRONG_SECRET);
  });

  it('throws when JWT_SECRET is missing (naming the variable, not the value)', () => {
    const env = validProd();
    delete env['JWT_SECRET'];
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is a known placeholder', () => {
    const env = { ...validProd(), JWT_SECRET: 'change-me-in-production' };
    try {
      loadConfig(env);
      throw new Error('expected loadConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      // The message must name the variable but must NOT echo the secret value.
      expect((err as Error).message).toContain('JWT_SECRET');
      expect((err as Error).message).not.toContain('change-me-in-production');
    }
  });

  it('throws when FIELD_ENCRYPTION_KEY is missing in production (naming the variable)', () => {
    const env = validProd();
    delete env['FIELD_ENCRYPTION_KEY'];
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it('throws when FIELD_ENCRYPTION_KEY is not 64 hex chars (never echoing the value)', () => {
    const env = { ...validProd(), FIELD_ENCRYPTION_KEY: 'zz-not-hex-and-too-short' };
    expect(() => loadConfig(env)).toThrow(/FIELD_ENCRYPTION_KEY/);
    try {
      loadConfig(env);
    } catch (err) {
      expect((err as Error).message).not.toContain('zz-not-hex-and-too-short');
    }
  });

  it('throws when JWT_SECRET is too weak (short)', () => {
    const env = { ...validProd(), JWT_SECRET: 'short' };
    expect(() => loadConfig(env)).toThrow(/JWT_SECRET/);
    // Never leak the value.
    try {
      loadConfig(env);
    } catch (err) {
      expect((err as Error).message).not.toContain('short');
    }
  });

  it('throws when SMTP is not configured in production (naming SMTP)', () => {
    const env = validProd();
    delete env['SMTP_HOST'];
    delete env['SMTP_PORT'];
    delete env['SMTP_USER'];
    delete env['SMTP_PASS'];
    delete env['MAIL_FROM'];
    expect(() => loadConfig(env)).toThrow(/SMTP/);
  });

  it('throws when SMTP is partially configured (missing MAIL_FROM)', () => {
    const env = validProd();
    delete env['MAIL_FROM'];
    expect(() => loadConfig(env)).toThrow(/MAIL_FROM/);
  });

  it('builds the smtp config from a complete set', () => {
    const cfg = loadConfig(validProd());
    expect(cfg.smtp).toMatchObject({
      host: 'smtp.rentplus.example',
      port: 587,
      user: 'mailer',
      from: 'no-reply@rentplus.example',
    });
  });

  it('throws when DATABASE_URL is missing in production', () => {
    const env = validProd();
    delete env['DATABASE_URL'];
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it('throws when CLIENT_URL is missing or localhost in production', () => {
    const missing = validProd();
    delete missing['CLIENT_URL'];
    expect(() => loadConfig(missing)).toThrow(/CLIENT_URL/);

    const local = { ...validProd(), CLIENT_URL: 'http://localhost:5173' };
    expect(() => loadConfig(local)).toThrow(/CLIENT_URL/);
  });
});

describe('loadConfig — development/test leniency', () => {
  it('requires only JWT_SECRET presence outside production', () => {
    const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' });
    expect(cfg.isProduction).toBe(false);
    expect(cfg.jwtSecret).toBe('test-secret');
    // DATABASE_URL/CLIENT_URL absent is fine in dev/test (mocked suite has none).
    expect(cfg.databaseUrl).toBeUndefined();
  });

  it('still requires JWT_SECRET to be present in development', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET/);
  });
});
