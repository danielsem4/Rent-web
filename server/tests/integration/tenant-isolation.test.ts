import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { resetDatabase, seedTenants, loginAs, type SeededTenants } from './helpers/db';

const app = createApp();
let t: SeededTenants;
let managerA: string[];
let managerB: string[];
// Same-origin value the CSRF check accepts in the test env; authenticated
// POST/PATCH requests must send it (CSRF runs before the router).
const ORIGIN = 'http://localhost:5173';

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  managerB = (await loginAs(app, t.managerB.email)).cookie;
});

// ===========================================================================
// List isolation — spec cases 5–6
// ===========================================================================
describe('Integration · list isolation', () => {
  it('Case 5 — Company A manager sees only Company A users', async () => {
    const res = await request(app).get('/api/users').set('Cookie', managerA);
    expect(res.status).toBe(200);

    const ids = (res.body.users as Array<{ id: number; companyId: number }>).map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining([t.managerA.id, t.workerA.id, t.renterA.id]));
    expect(ids).not.toContain(t.managerB.id);
    expect(ids).not.toContain(t.workerB.id);
    expect(
      (res.body.users as Array<{ companyId: number }>).every((u) => u.companyId === t.companyA),
    ).toBe(true);
  });

  it('Case 6 — Company B manager sees only Company B users', async () => {
    const res = await request(app).get('/api/users').set('Cookie', managerB);
    expect(res.status).toBe(200);

    const ids = (res.body.users as Array<{ id: number }>).map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining([t.managerB.id, t.workerB.id]));
    expect(ids).not.toContain(t.managerA.id);
    expect(ids).not.toContain(t.workerA.id);
    expect(
      (res.body.users as Array<{ companyId: number }>).every((u) => u.companyId === t.companyB),
    ).toBe(true);
  });
});

// ===========================================================================
// Read isolation — spec cases 7–9
// ===========================================================================
describe('Integration · read isolation', () => {
  it('Case 7 — Company A manager can read a Company A user', async () => {
    const res = await request(app).get(`/api/users/${t.workerA.id}`).set('Cookie', managerA);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(t.workerA.id);
  });

  it('Case 8 — Company A manager reading a Company B user → 404', async () => {
    const res = await request(app).get(`/api/users/${t.workerB.id}`).set('Cookie', managerA);
    expect(res.status).toBe(404);
  });

  it('Case 9 — Company B manager reading a Company A user → 404', async () => {
    const res = await request(app).get(`/api/users/${t.workerA.id}`).set('Cookie', managerB);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Update isolation — spec cases 10–12
// ===========================================================================
describe('Integration · update isolation', () => {
  it('Case 10 — Company A manager can update a Company A worker', async () => {
    const res = await request(app)
      .patch(`/api/users/${t.workerA.id}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ name: 'Renamed A Worker' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Renamed A Worker');

    const row = await prisma.user.findUnique({ where: { id: t.workerA.id } });
    expect(row?.name).toBe('Renamed A Worker');
  });

  it('Case 11 & 12 — Company A manager cannot update a Company B worker (404) and the DB row is unchanged', async () => {
    const before = await prisma.user.findUnique({ where: { id: t.workerB.id } });

    const res = await request(app)
      .patch(`/api/users/${t.workerB.id}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ name: 'HACKED' });

    expect(res.status).toBe(404);

    // Verify directly in PostgreSQL — not just via the HTTP response.
    const after = await prisma.user.findUnique({ where: { id: t.workerB.id } });
    expect(after?.name).toBe(before?.name);
    expect(after?.name).not.toBe('HACKED');
  });
});

// ===========================================================================
// Create isolation — spec cases 13–16
// ===========================================================================
describe('Integration · create isolation', () => {
  it('Case 13 — created worker belongs to the manager’s company (verified in DB)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ email: 'created-a@test.local', name: 'Created A', password: 'password123', role: 'COMPANY_WORKER' });

    expect(res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: 'created-a@test.local' } });
    expect(row?.companyId).toBe(t.companyA);
  });

  it('Case 14 — a client-supplied Company B companyId is ignored; row lands in Company A, none in B', async () => {
    const bBefore = await prisma.user.count({ where: { companyId: t.companyB } });

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({
        email: 'inject-b@test.local',
        name: 'Inject B',
        password: 'password123',
        role: 'COMPANY_WORKER',
        companyId: t.companyB, // hostile field — must be ignored
      });

    expect(res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: 'inject-b@test.local' } });
    expect(row?.companyId).toBe(t.companyA);

    const bAfter = await prisma.user.count({ where: { companyId: t.companyB } });
    expect(bAfter).toBe(bBefore); // no user was added to Company B
  });

  it('Case 15 — creating a SUPER_ADMIN is rejected (400) and nothing is written', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ email: 'evil@test.local', name: 'Evil', password: 'password123', role: 'SUPER_ADMIN' });

    expect(res.status).toBe(400);
    const row = await prisma.user.findUnique({ where: { email: 'evil@test.local' } });
    expect(row).toBeNull();
  });

  it('Case 16 — a duplicate email conflicts (409) against the real unique constraint', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ email: t.workerA.email, name: 'Dup', password: 'password123', role: 'RENTER' });

    expect(res.status).toBe(409);
  });
});

// ===========================================================================
// Self-role protection — spec case 21
// ===========================================================================
describe('Integration · self-role protection', () => {
  it('Case 21 — a manager cannot change their own role (403); DB role stays COMPANY_MANAGER', async () => {
    const res = await request(app)
      .patch(`/api/users/${t.managerA.id}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ role: 'COMPANY_WORKER' });

    expect(res.status).toBe(403);
    const row = await prisma.user.findUnique({ where: { id: t.managerA.id } });
    expect(row?.role).toBe('COMPANY_MANAGER');
  });
});

// ===========================================================================
// Foreign-company write proof (core tenant-isolation regression) — spec case 22
// ===========================================================================
describe('Integration · foreign-company write proof', () => {
  it('Case 22 — a crafted cross-tenant mutation is rejected AND leaves the target row byte-identical', async () => {
    const before = await prisma.user.findUnique({ where: { id: t.managerB.id } });

    const res = await request(app)
      .patch(`/api/users/${t.managerB.id}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ name: 'Owned', email: 'owned@test.local' });

    expect(res.status).toBe(404);

    const after = await prisma.user.findUnique({ where: { id: t.managerB.id } });
    expect(after).toEqual(before); // full row unchanged, verified in PostgreSQL
  });
});
