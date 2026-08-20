import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  resetDatabase,
  seedTenants,
  loginAs,
  createTestApp,
  TEST_PASSWORD,
  type SeededTenants,
} from './helpers/db';

const app = createTestApp();
let t: SeededTenants;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
});

// ===========================================================================
// Authentication context (real DB) — spec cases 1–4
// ===========================================================================
describe('Integration · authentication context (real DB)', () => {
  it('Case 1 — Company A manager can log in (completing mandatory MFA)', async () => {
    // managerA is a COMPANY_MANAGER (MFA-mandatory): the raw login returns a
    // challenge, and loginAs completes the second factor to reach a session.
    const first = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    expect(first.status).toBe(200);
    expect(first.body.mfaRequired).toBe(true);
    expect(first.headers['set-cookie']).toBeUndefined(); // no session on step 1

    const { user } = await loginAs(app, t.managerA.email);
    expect(user.email).toBe(t.managerA.email);
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('Case 2 — /api/auth/me returns Company A’s real companyId', async () => {
    const { cookie } = await loginAs(app, t.managerA.email);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.companyId).toBe(t.companyA);
    expect(res.body.user.role).toBe('COMPANY_MANAGER');
  });

  it('Case 3 — Company B manager returns a different companyId', async () => {
    const { cookie } = await loginAs(app, t.managerB.email);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.companyId).toBe(t.companyB);
    expect(t.companyA).not.toBe(t.companyB);
  });

  it('Case 4 — authenticated context reflects the real DB role/company relationship', async () => {
    const { user } = await loginAs(app, t.workerA.email);
    expect(user.role).toBe('COMPANY_WORKER');
    expect(user.companyId).toBe(t.companyA);
  });
});

// ===========================================================================
// Role authorization on /api/users (real DB) — spec cases 17–20
// ===========================================================================
describe('Integration · role authorization on /api/users (real DB)', () => {
  it('COMPANY_MANAGER → 200', async () => {
    const { cookie } = await loginAs(app, t.managerA.email);
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('Case 17 — COMPANY_WORKER → 403', async () => {
    const { cookie } = await loginAs(app, t.workerA.email);
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('Case 18 — RENTER → 403', async () => {
    const { cookie } = await loginAs(app, t.renterA.email);
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('Case 19 — SUPER_ADMIN → 403 (no bypass on company-scoped routes)', async () => {
    const { cookie } = await loginAs(app, t.superAdmin.email);
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('Case 20 — unauthenticated → 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});
