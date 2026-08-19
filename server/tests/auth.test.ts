import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { makeUserRow, signToken, signExpiredToken, DEFAULT_PASSWORD, type UserRow } from './helpers/fixtures';
import { ROLE_VALUES, Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// Prisma isolation.
//
// `vi.mock` is hoisted above all imports, so the app's transitive import of
// `../src/lib/prisma` (via auth.repository.ts) receives this fake instead of
// the real client. The real module body — which constructs PrismaClient +
// PrismaPg over `pg` — therefore NEVER runs, and no database is ever contacted.
// The mock is created with `vi.hoisted` so it exists before the factory runs.
// ---------------------------------------------------------------------------
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({
  default: { user: { findUnique }, auditLog: { create: vi.fn() } },
}));

// Imported AFTER the mock is registered (hoisting guarantees the order).
import { createApp } from '../src/app';
import { authenticate } from '../src/shared/middlewares/authenticate';
import { errorHandler } from '../src/shared/middlewares/errorHandler';

const app = createApp();

// A minimal TEST-ONLY app that exposes the raw `req.currentUser` the
// `authenticate` middleware builds, so we can assert the middleware resolves
// role/companyId from the DB (not from the token's snapshot claims). This is a
// test harness — never a production endpoint.
const ctxApp = express();
ctxApp.use(cookieParser());
ctxApp.get('/_ctx', authenticate, (req, res) => {
  res.json(req.currentUser);
});
ctxApp.use(errorHandler);

/** Decode a `token=...` value out of a supertest `set-cookie` header. */
function tokenFromSetCookie(setCookie: string[]): Record<string, unknown> {
  const cookie = setCookie.find((c) => c.startsWith('token='));
  if (!cookie) throw new Error('no token cookie present');
  const raw = cookie.slice('token='.length).split(';')[0]!;
  return jwt.verify(raw, process.env['JWT_SECRET'] as string) as Record<string, unknown>;
}

// A mutable in-memory table the mocked `findUnique` reads from. `auth.repository`
// calls `findUnique({ where: { email } })` and `findUnique({ where: { id } })`.
let users: UserRow[] = [];

findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: number } }) => {
  if (where.email !== undefined) return users.find((u) => u.email === where.email) ?? null;
  if (where.id !== undefined) return users.find((u) => u.id === where.id) ?? null;
  return null;
});

const INVALID_CREDENTIALS = 'Invalid email or password';
const AUTH_REQUIRED = 'Authentication required';
// Same-origin value the CSRF check accepts in the test env (config.clientUrl is
// unset ⇒ the dev fallback origin). Authenticated (cookie-bearing) mutations
// must send it, since the CSRF middleware runs before `authenticate`.
const ORIGIN = 'http://localhost:5173';

beforeEach(async () => {
  // Fresh isolated fixture per test: one COMPANY_MANAGER with a known password.
  users = [await makeUserRow()];
});

// Sanity: harness is wired up correctly.
describe('GET /api/health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/auth/login', () => {
  // Case 1
  it('valid credentials return 200 with the safe user payload and set the token cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: 1,
        email: 'manager@test.dev',
        name: 'Test Manager',
        role: 'COMPANY_MANAGER',
        companyId: 1,
      },
    });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    expect(setCookie.join(';')).toMatch(/(^|;)\s*token=/);
    // Case 10 (login): passwordHash must never appear in the response.
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  // Case 2
  it('wrong password returns 401 with the generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(INVALID_CREDENTIALS);
  });

  // Case 3
  it('unknown email returns 401 with a message identical to wrong-password (no account enumeration)', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: DEFAULT_PASSWORD });
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: 'wrong-password' });

    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    // Same status AND same body => a caller cannot tell whether the account exists.
    expect(unknown.body.message).toBe(wrongPw.body.message);
    expect(unknown.body.message).toBe(INVALID_CREDENTIALS);
  });
});

describe('GET /api/auth/me', () => {
  // Case 4
  it('without authentication returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });

  // Case 5 (+ Case 10 for /me)
  it('with a valid session returns the current user without passwordHash', async () => {
    const token = signToken(1, 'COMPANY_MANAGER');
    const res = await request(app).get('/api/auth/me').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: 1,
        email: 'manager@test.dev',
        name: 'Test Manager',
        role: 'COMPANY_MANAGER',
        companyId: 1,
      },
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  // Case 6
  it('with an invalid/garbage token cookie returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', ['token=not-a-real-jwt']);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });

  // Case 7
  it('with an expired token returns 401', async () => {
    const token = signExpiredToken(1, 'COMPANY_MANAGER');
    const res = await request(app).get('/api/auth/me').set('Cookie', [`token=${token}`]);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

describe('POST /api/auth/refresh', () => {
  // Case 8 — documents CURRENT behavior: it is an authenticated route that
  // rotates the token cookie and returns only a message (no user payload).
  it('with a valid session returns 200 and a fresh token cookie', async () => {
    const token = signToken(1, 'COMPANY_MANAGER');
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`token=${token}`])
      .set('Origin', ORIGIN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Token refreshed' });
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    expect(setCookie.join(';')).toMatch(/(^|;)\s*token=/);
  });

  it('without authentication returns 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

describe('POST /api/auth/logout', () => {
  // Case 9
  it('returns 200 and clears the token cookie', async () => {
    const token = signToken(1, 'COMPANY_MANAGER');
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`token=${token}`])
      .set('Origin', ORIGIN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const tokenCookie = setCookie.find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    // Cleared cookie is expired: either Max-Age=0 or an Expires date in the past.
    expect(tokenCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it('succeeds without authentication (no guard on logout)', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });
  });
});

describe('Role taxonomy', () => {
  // Case 6 — guards against regressing to the removed ADMIN/USER roles.
  it('is exactly the four confirmed Rent+ roles', () => {
    expect(new Set(ROLE_VALUES)).toEqual(
      new Set(['SUPER_ADMIN', 'COMPANY_MANAGER', 'COMPANY_WORKER', 'RENTER']),
    );
  });

  it('does not contain the removed ADMIN or USER roles', () => {
    expect(ROLE_VALUES).not.toContain('ADMIN');
    expect(ROLE_VALUES).not.toContain('USER');
  });

  // Cases 1–5 — every role authenticates and its role is preserved in the
  // response. COMPANY_MANAGER is the "seeded manager can still log in" case; the
  // others prove each role is represented safely by the auth types + payload.
  // (Role-typed fixtures give the compile-time "represented safely" guarantee.)
  for (const role of ROLE_VALUES) {
    it(`a ${role} user authenticates and the response preserves the role`, async () => {
      const email = `${role.toLowerCase()}@test.dev`;
      users = [await makeUserRow({ id: 1, email, role })];

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: DEFAULT_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });
  }
});

// ===========================================================================
// Step 4 — Trusted, DB-authoritative company context.
// ===========================================================================

describe('Login — company context', () => {
  // Case 1: the safe user carries the current DB companyId.
  it('includes the correct companyId from the DB row', async () => {
    users = [await makeUserRow({ id: 1, email: 'manager@test.dev', companyId: 7 })];

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.companyId).toBe(7);
  });

  // Case 2: Role is preserved (and strongly typed as the Prisma Role).
  it('preserves the Role from the DB row', async () => {
    users = [await makeUserRow({ id: 1, role: Role.COMPANY_WORKER })];

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('COMPANY_WORKER');
  });

  // Case 3: passwordHash is never exposed (also covered above; kept explicit).
  it('never exposes passwordHash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  // The issued token embeds the current companyId snapshot claim.
  it('issues a token whose companyId snapshot matches the DB row', async () => {
    users = [await makeUserRow({ id: 1, companyId: 7, role: Role.COMPANY_MANAGER })];

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.dev', password: DEFAULT_PASSWORD });

    const decoded = tokenFromSetCookie(res.headers['set-cookie'] as unknown as string[]);
    expect(decoded.userId).toBe(1);
    expect(decoded.role).toBe('COMPANY_MANAGER');
    expect(decoded.companyId).toBe(7);
  });
});

describe('GET /api/auth/me — reflects current DB state', () => {
  // Cases 4 & 5: /me returns the CURRENT DB companyId and role even when the
  // presented token carries stale snapshot claims.
  it('returns DB-backed companyId and role, ignoring stale token claims', async () => {
    users = [await makeUserRow({ id: 1, role: Role.COMPANY_MANAGER, companyId: 5 })];
    // Token claims say RENTER / company 999 — both must be ignored.
    const token = signToken(1, Role.RENTER, 999);

    const res = await request(app).get('/api/auth/me').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('COMPANY_MANAGER');
    expect(res.body.user.companyId).toBe(5);
  });
});

describe('authenticate middleware — req.currentUser is DB-authoritative', () => {
  // Case 6: token role is stale; currentUser.role comes from the DB.
  it('uses the DB role, not the stale token role', async () => {
    users = [await makeUserRow({ id: 1, role: Role.COMPANY_MANAGER, companyId: 1 })];
    const token = signToken(1, Role.RENTER, 1); // stale role claim

    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 1, role: 'COMPANY_MANAGER', companyId: 1, tokenVersion: 0 });
  });

  // Case 7: token companyId is stale; currentUser.companyId comes from the DB.
  it('uses the DB companyId, not the stale token companyId', async () => {
    users = [await makeUserRow({ id: 1, role: Role.COMPANY_MANAGER, companyId: 1 })];
    const token = signToken(1, Role.COMPANY_MANAGER, 999); // stale company claim

    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(1);
  });

  // Case 12: SUPER_ADMIN authenticates like any user and exposes its internal
  // platform companyId in the trusted context.
  it('authenticates SUPER_ADMIN and exposes the internal platform companyId', async () => {
    users = [
      await makeUserRow({ id: 1, email: 'super@rentplus.dev', role: Role.SUPER_ADMIN, companyId: 4 }),
    ];
    const token = signToken(1, Role.SUPER_ADMIN, 4);

    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 1, role: 'SUPER_ADMIN', companyId: 4, tokenVersion: 0 });
  });
});

describe('Deleted user', () => {
  // Case 8: valid, unexpired token whose user no longer exists → 401, generic.
  it('rejects a valid token referencing a nonexistent user (via /me)', async () => {
    users = []; // user was deleted after the token was issued
    const token = signToken(1, Role.COMPANY_MANAGER, 1);

    const res = await request(app).get('/api/auth/me').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a valid token referencing a nonexistent user (middleware)', async () => {
    users = [];
    const token = signToken(2, Role.COMPANY_MANAGER, 1); // id 2 not present

    const res = await request(ctxApp).get('/_ctx').set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});

describe('POST /api/auth/refresh — re-issues from current DB state', () => {
  // Cases 9, 10 & 11: the refreshed token must carry the CURRENT DB role and
  // companyId, never the old token's stale claims.
  it('signs the refreshed token from the DB role/companyId, not the stale claims', async () => {
    // DB says the user is now a COMPANY_WORKER in company 5...
    users = [await makeUserRow({ id: 1, role: Role.COMPANY_WORKER, companyId: 5 })];
    // ...but the presented token still claims COMPANY_MANAGER / company 1.
    const stale = signToken(1, Role.COMPANY_MANAGER, 1);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`token=${stale}`])
      .set('Origin', ORIGIN);

    expect(res.status).toBe(200);
    const decoded = tokenFromSetCookie(res.headers['set-cookie'] as unknown as string[]);
    expect(decoded.role).toBe('COMPANY_WORKER');
    expect(decoded.companyId).toBe(5);
  });

  it('rejects refresh for a deleted user', async () => {
    users = [];
    const token = signToken(1, Role.COMPANY_MANAGER, 1);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`token=${token}`])
      .set('Origin', ORIGIN);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });
});
