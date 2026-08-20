import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, DEFAULT_PASSWORD, type UserRow } from './helpers/fixtures';

// ---------------------------------------------------------------------------
// Prisma isolation — same hoisted-mock pattern as auth/security tests. Login
// only reads the user via findUnique, so a findUnique-only mock is sufficient.
// ---------------------------------------------------------------------------
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique, update: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn() },
    refreshToken: { create: vi.fn() },
  },
}));

import { createApp } from '../src/app';
import { loadConfig } from '../src/shared/config/env';
import { TOO_MANY_REQUESTS_MESSAGE } from '../src/shared/security/rateLimit';

let users: UserRow[] = [];
findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: number } }) => {
  if (where.email !== undefined) return users.find((u) => u.email === where.email) ?? null;
  if (where.id !== undefined) return users.find((u) => u.id === where.id) ?? null;
  return null;
});

beforeEach(async () => {
  users = [await makeUserRow()];
});

/**
 * Build an app with TINY, deterministic rate limits via an explicit env object
 * (no global process.env mutation) — mirroring the Batch-1 prod-CORS test. Each
 * createApp() gets its own fresh in-memory limiter store, so tests are isolated.
 */
function appWithLimits(over: Record<string, string> = {}) {
  return createApp(
    loadConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_LOGIN_IP_MAX: '3',
      RATE_LIMIT_LOGIN_IP_WINDOW_MS: '900000',
      RATE_LIMIT_LOGIN_EMAIL_MAX: '1000000', // isolate the IP limiter under test
      RATE_LIMIT_REFRESH_MAX: '1000000',
      ...over,
    } as NodeJS.ProcessEnv),
  );
}

describe('rate limiting — login', () => {
  it('throttles repeated login attempts past the threshold (429)', async () => {
    const app = appWithLimits(); // login-IP limit = 3

    // First 3 attempts are processed (wrong password → 401), not throttled.
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'manager@test.dev', password: 'wrong-password' });
      expect(res.status).toBe(401);
    }

    // The 4th trips the limiter.
    const throttled = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: 'wrong-password' });
    expect(throttled.status).toBe(429);
  });

  it('lets legitimate requests below the threshold through (incl. a valid login)', async () => {
    const app = appWithLimits({ RATE_LIMIT_LOGIN_IP_MAX: '5' });

    // Two failed attempts...
    for (let i = 0; i < 2; i++) {
      const bad = await request(app)
        .post('/api/auth/login')
        .send({ email: 'manager@test.dev', password: 'wrong-password' });
      expect(bad.status).toBe(401);
    }

    // ...then a correct login still succeeds (below the limit).
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('does not disclose whether an account exists once throttled', async () => {
    const app = appWithLimits(); // limit = 3

    // Burn the per-IP budget with an unknown email.
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.dev', password: 'wrong-password' });
    }

    // Now BOTH a known and an unknown email get the identical 429 — the throttle
    // is keyed on IP/attempt count, never on account existence.
    const knownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'wrong-password' });

    expect(knownEmail.status).toBe(429);
    expect(unknownEmail.status).toBe(429);
    expect(knownEmail.body).toEqual(unknownEmail.body);
  });

  it('returns a safe, standardized 429 (generic body + RateLimit headers, no internals)', async () => {
    const app = appWithLimits(); // limit = 3

    let res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: 'wrong-password' });
    for (let i = 0; i < 3; i++) {
      res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'manager@test.dev', password: 'wrong-password' });
    }

    expect(res.status).toBe(429);
    // Generic, standardized message — nothing beyond `message`.
    expect(res.body).toEqual({ message: TOO_MANY_REQUESTS_MESSAGE });
    // RFC RateLimit headers present; no legacy X-RateLimit-* and no stack/internals.
    expect(res.headers).toHaveProperty('ratelimit-policy');
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/at .*\(/);
    expect(raw).not.toContain('passwordHash');
  });
});

describe('rate limiting — account-level login throttle', () => {
  it('multi-IP attempts against one email eventually trip the account-level limiter', async () => {
    // per-IP (10) and email+IP (8) are generous; the account cap (20, email-only)
    // is the ONLY layer that can see a distributed attack. TRUST_PROXY=1 lets each
    // request present a distinct source IP via X-Forwarded-For.
    const app = appWithLimits({
      TRUST_PROXY: '1',
      RATE_LIMIT_LOGIN_IP_MAX: '10',
      RATE_LIMIT_LOGIN_EMAIL_MAX: '8',
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: '20',
    });

    const email = 'manager@test.dev';
    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'];
    const statuses: number[] = [];
    let tripIndex = -1;

    // 6 failed attempts per IP: every IP stays under per-IP (10) AND email+IP (8),
    // so neither IP-composited limiter ever fires — only the account cap can.
    for (let ipIdx = 0; ipIdx < ips.length && tripIndex === -1; ipIdx++) {
      for (let i = 0; i < 6 && tripIndex === -1; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', ips[ipIdx] as string)
          .send({ email, password: 'wrong-password' });
        statuses.push(res.status);
        if (res.status === 429) tripIndex = statuses.length - 1;
      }
    }

    // The first 20 failures are processed (401) — proof the per-IP/email+IP
    // limiters never tripped — and the 21st, still under every per-IP budget,
    // is throttled by the account-level limiter.
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(401));
    expect(tripIndex).toBe(20);
    expect(statuses[20]).toBe(429);
  });

  it('throttles unknown and known emails identically (enumeration-safe, applies to non-existent accounts)', async () => {
    // Isolate the account limiter (IP + email+IP effectively unlimited).
    const app = appWithLimits({
      RATE_LIMIT_LOGIN_IP_MAX: '1000000',
      RATE_LIMIT_LOGIN_EMAIL_MAX: '1000000',
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: '3',
    });

    // Burn one account's budget (3) → the 4th failed attempt is throttled.
    const burn = async (email: string) => {
      let res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrong-password' });
      for (let i = 0; i < 3; i++) {
        res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrong-password' });
      }
      return res;
    };

    const known = await burn('manager@test.dev'); // exists in the mock store
    const unknown = await burn('nobody@test.dev'); // does NOT exist

    // Same status AND byte-identical body — the account throttle keys on the
    // normalized email alone and cannot be used to probe account existence.
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({ message: TOO_MANY_REQUESTS_MESSAGE });
  });

  it('creates no permanent lockout — the throttle auto-lifts after the window', async () => {
    // Short account window; unknown email → fast 401 (no bcrypt) so the first
    // attempts comfortably land inside the window before it rolls over.
    const app = appWithLimits({
      RATE_LIMIT_LOGIN_IP_MAX: '1000000',
      RATE_LIMIT_LOGIN_EMAIL_MAX: '1000000',
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: '2',
      RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_MS: '500',
    });

    const email = 'nobody@test.dev';
    const attempt = () =>
      request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429); // budget (2) exhausted → throttled

    // Wait out the rolling window. A permanent lockout would keep returning 429;
    // a temporary throttle lets the account be attempted again.
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect((await attempt()).status).toBe(401); // processed again — no lockout state
  });

  it('a successful login does not reset or bypass the per-IP protection', async () => {
    // Isolate the per-IP limiter (3). The account/email limiters skip successful
    // logins; the IP limiter must NOT — a mid-sequence success still consumes a
    // slot and cannot be used to wipe the accumulated per-IP count.
    const app = appWithLimits({
      RATE_LIMIT_LOGIN_IP_MAX: '3',
      RATE_LIMIT_LOGIN_EMAIL_MAX: '1000000',
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: '1000000',
    });

    const email = 'manager@test.dev';
    const fail = () =>
      request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });

    expect((await fail()).status).toBe(401); // IP count 1
    expect((await fail()).status).toBe(401); // IP count 2
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email, password: DEFAULT_PASSWORD });
    expect(ok.status).toBe(200); // IP count 3 (success still counts — no skip)

    // 4th request from the same IP is throttled: the success neither reset nor
    // bypassed the per-IP limiter.
    expect((await fail()).status).toBe(429);
  });
});

describe('rate limiting — refresh', () => {
  it('throttles repeated refresh attempts past the threshold (429)', async () => {
    // Unauthenticated refresh (no cookie) still passes through the limiter, so we
    // can exercise the per-IP refresh limit without a session.
    const app = appWithLimits({ RATE_LIMIT_REFRESH_MAX: '2' });

    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    const throttled = await request(app).post('/api/auth/refresh');
    expect(throttled.status).toBe(429);
  });
});
