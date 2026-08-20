import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../src/shared/config/env';

// A configuration that is valid for production, used as a baseline to mutate.
const STRONG_SECRET = 'x7Kd9Qp2Rm5Tn8Vb1Wc4Ye6Zg0Hj3Lo9Su2Ad5Fh8'; // 40+ chars, not a placeholder
const validProd = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: STRONG_SECRET,
  MFA_ENCRYPTION_KEY: 'Zx3Bq9Lt2Mv6Pw1Cy4Rn7Ke0Hs5Ud8Ff2Ag6Jl9Q', // 40+ chars, not a placeholder
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/rentplus',
  CLIENT_URL: 'https://app.rentplus.example',
  PORT: '5001',
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

  it('throws when MFA_ENCRYPTION_KEY is missing in production (naming the variable)', () => {
    const env = validProd();
    delete env['MFA_ENCRYPTION_KEY'];
    expect(() => loadConfig(env)).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it('throws when MFA_ENCRYPTION_KEY is a known placeholder (without echoing it)', () => {
    const env = { ...validProd(), MFA_ENCRYPTION_KEY: 'change-me-in-production' };
    try {
      loadConfig(env);
      throw new Error('expected loadConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain('MFA_ENCRYPTION_KEY');
      expect((err as Error).message).not.toContain('change-me-in-production');
    }
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
