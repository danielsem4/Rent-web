import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { makeUserRow, signToken, DEFAULT_PASSWORD, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// Prisma isolation — identical pattern to auth.test.ts. `vi.mock` is hoisted so
// the app's transitive import of `../src/lib/prisma` receives this fake; no DB
// is ever contacted.
// ---------------------------------------------------------------------------
const { findUnique, auditCreate } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  auditCreate: vi.fn(async () => ({})),
}));

vi.mock('../src/lib/prisma', () => ({
  default: {
    user: { findUnique },
    auditLog: { create: auditCreate },
    refreshToken: { create: vi.fn() },
  },
}));

import { createApp } from '../src/app';
import { authenticate } from '../src/shared/middlewares/authenticate';
import { errorHandler } from '../src/shared/middlewares/errorHandler';
import { loadConfig, ConfigError } from '../src/shared/config/env';

const app = createApp();

// Test-only harness exposing req.currentUser (as in auth.test.ts).
const ctxApp = express();
ctxApp.use(cookieParser());
ctxApp.get('/_ctx', authenticate, (req, res) => {
  res.json(req.currentUser);
});
ctxApp.use(errorHandler);

// A test-only app whose single route throws a NON-AppError carrying a
// secret-looking string, so we can prove the error handler never leaks it.
const THROWN_SECRET = 'super-secret-db-password-and-connection-string';
const boomApp = express();
boomApp.get('/_boom', (_req, _res) => {
  throw new Error(THROWN_SECRET);
});
boomApp.use(errorHandler);

const AUTH_REQUIRED = 'Authentication required';

let users: UserRow[] = [];
findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: number } }) => {
  if (where.email !== undefined) return users.find((u) => u.email === where.email) ?? null;
  if (where.id !== undefined) return users.find((u) => u.id === where.id) ?? null;
  return null;
});

beforeEach(async () => {
  users = [await makeUserRow()];
});

// ===========================================================================
// P0 — unexpected errors never leak internals in production.
// ===========================================================================
describe('errorHandler — production-safe 500', () => {
  const original = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = original;
  });

  it('returns a generic body with no internal detail in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const res = await request(boomApp).get('/_boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
    // The thrown message, stack, and any DB/secret text must not appear anywhere.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(THROWN_SECRET);
    expect(raw).not.toContain('detail');
    expect(raw).not.toMatch(/at .*\(/); // no stack frames
  });

  it('includes a detail aid only outside production', async () => {
    process.env['NODE_ENV'] = 'test';
    const res = await request(boomApp).get('/_boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body.detail).toBe(THROWN_SECRET); // dev DX only
  });
});

// ===========================================================================
// Account status (isActive).
// ===========================================================================
describe('account status', () => {
  it('an active user logs in (200)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('a disabled account w/ correct password is indistinguishable from bad creds (401); reason recorded in the audit trail', async () => {
    // Disabled account, CORRECT password.
    users = [await makeUserRow({ isActive: false })];
    const disabled = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });

    // Active account, WRONG password — the baseline generic failure.
    users = [await makeUserRow({ isActive: true })];
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: 'not-the-password' });

    // A caller cannot tell a disabled account from a wrong password: same status,
    // same body. No 403, no "Account is disabled" leak.
    expect(disabled.status).toBe(401);
    expect(disabled.status).toBe(wrongPw.status);
    expect(disabled.body).toEqual(wrongPw.body);
    expect(disabled.body.message).toBe('Invalid email or password');

    // The real reason IS recorded server-side (audit trail), but never sent to
    // the client. An AUTH_LOGIN_FAILED audit event carries reason 'account_disabled'.
    const writes = auditCreate.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    const disabledEvent = writes.find(
      (d) => (d['metadata'] as { reason?: string } | null)?.reason === 'account_disabled',
    );
    expect(disabledEvent).toBeDefined();
    expect(disabledEvent!['action']).toBe('AUTH_LOGIN_FAILED');
    expect(JSON.stringify(disabled.body)).not.toMatch(/disabled/i);
  });

  it('disabling an already-authenticated user fails their next protected request', async () => {
    // Token issued while active...
    const token = signToken(1, Role.COMPANY_MANAGER, 1, 0);
    const before = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);
    expect(before.status).toBe(200);

    // ...account is disabled in the DB; the SAME token is now rejected.
    users = [await makeUserRow({ isActive: false })];
    const after = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);
    expect(after.status).toBe(401);
    expect(after.body.message).toBe(AUTH_REQUIRED);
  });
});

// ===========================================================================
// tokenVersion / revoke-all.
// ===========================================================================
describe('tokenVersion revoke-all', () => {
  it('a token whose version matches the DB is accepted', async () => {
    users = [await makeUserRow({ tokenVersion: 3 })];
    const token = signToken(1, Role.COMPANY_MANAGER, 1, 3);
    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body.tokenVersion).toBe(3);
  });

  it('a token issued before a version bump is rejected (401)', async () => {
    // Token minted at version 0...
    const token = signToken(1, Role.COMPANY_MANAGER, 1, 0);
    // ...DB tokenVersion is bumped (revoke-all) to 1.
    users = [await makeUserRow({ tokenVersion: 1 })];
    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

// ===========================================================================
// Stale claim safety — the new checks must not reintroduce trust in token claims.
// ===========================================================================
describe('stale token claims never override DB state', () => {
  it('an elevated role claim cannot override the lower DB role', async () => {
    users = [await makeUserRow({ id: 1, role: Role.RENTER, companyId: 2, tokenVersion: 0 })];
    // Token falsely claims SUPER_ADMIN / company 999.
    const token = signToken(1, Role.SUPER_ADMIN, 999, 0);
    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('RENTER');
    expect(res.body.companyId).toBe(2);
  });
});

// ===========================================================================
// CORS origin comes from the validated config — one authoritative config path,
// and production can NEVER silently fall back to localhost.
// ===========================================================================
describe('CORS origin comes from validated config (no silent localhost fallback in prod)', () => {
  // A complete, strong production environment. `loadConfig` takes an explicit env
  // object, so these tests never mutate the global process.env.
  const validProd = (over: Record<string, string | undefined> = {}) => ({
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    MFA_ENCRYPTION_KEY: 'y'.repeat(40),
    DATABASE_URL: 'postgres://u:p@db.example.com:5432/app',
    CLIENT_URL: 'https://app.example.com',
    ...over,
  });

  it('production CORS reflects the validated CLIENT_URL', async () => {
    const prodApp = createApp(loadConfig(validProd() as NodeJS.ProcessEnv));
    const res = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'https://app.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('production CORS never falls back to localhost', async () => {
    const prodApp = createApp(loadConfig(validProd() as NodeJS.ProcessEnv));
    const res = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).not.toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('a production config missing CLIENT_URL fails fast (cannot boot to a localhost fallback)', () => {
    expect(() => loadConfig(validProd({ CLIENT_URL: undefined }) as NodeJS.ProcessEnv)).toThrow(
      ConfigError,
    );
  });
});
