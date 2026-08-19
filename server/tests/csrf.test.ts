import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// Prisma isolation — findUnique-only mock is enough: the authenticated endpoint
// under test (POST /api/auth/refresh) only reads the user.
// ---------------------------------------------------------------------------
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({
  default: { user: { findUnique } },
}));

import { createApp } from '../src/app';

const app = createApp();

// In the test env `config.clientUrl` is unset, so the CSRF allowed origin is the
// dev fallback. Cross-site attacker origin is anything else.
const ALLOWED_ORIGIN = 'http://localhost:5173';
const EVIL_ORIGIN = 'https://attacker.example';
const CSRF_FAILED = 'CSRF validation failed';

let users: UserRow[] = [];
findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: number } }) => {
  if (where.email !== undefined) return users.find((u) => u.email === where.email) ?? null;
  if (where.id !== undefined) return users.find((u) => u.id === where.id) ?? null;
  return null;
});

beforeEach(async () => {
  users = [await makeUserRow()];
});

/** A valid session cookie for the seeded manager (id 1). */
function sessionCookie(): string[] {
  return [`token=${signToken(1, Role.COMPANY_MANAGER, 1)}`];
}

describe('CSRF — Origin/Referer validation on authenticated state-changing requests', () => {
  it('allows a same-origin authenticated mutation (200 + fresh cookie)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sessionCookie())
      .set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.join(';')).toMatch(/(^|;)\s*token=/);
  });

  it('accepts a valid same-origin Referer when Origin is absent', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sessionCookie())
      .set('Referer', `${ALLOWED_ORIGIN}/dashboard`);

    expect(res.status).toBe(200);
  });

  it('rejects a cross-origin authenticated mutation (403), and does NOT process it', async () => {
    // The forged request carries a valid session cookie (as a real CSRF attack
    // would) and a cross-site Origin. The SERVER itself rejects it with 403 —
    // this is server-side enforcement, independent of CORS.
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sessionCookie())
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(CSRF_FAILED);
    // The mutation was not performed — no new session cookie was issued.
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an authenticated mutation with NO Origin and NO Referer (fail closed)', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', sessionCookie());

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(CSRF_FAILED);
  });

  it('rejects an authenticated mutation whose Referer origin is cross-site (403)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sessionCookie())
      .set('Referer', `${EVIL_ORIGIN}/attack`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(CSRF_FAILED);
  });

  it('does NOT block a safe GET (no Origin required)', async () => {
    // Safe methods are never CSRF-checked, even with a cookie and no Origin.
    const res = await request(app).get('/api/auth/me').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(1);
  });

  it('CORS is not a substitute: the CSRF check runs server-side regardless of CORS', async () => {
    // CORS is a browser-enforced read policy — it never stops the server from
    // executing a forged write. Prove the server rejects the cross-origin
    // mutation itself (403 from the CSRF middleware), not via any CORS behavior.
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sessionCookie())
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(CSRF_FAILED);
  });
});
