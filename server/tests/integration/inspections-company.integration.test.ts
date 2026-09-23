import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Read-only, company-wide inspections list: GET /api/inspections.
// Verifies tenant isolation, role authorization, and that no write verbs exist
// (inspections are created/edited only via the property-scoped router).

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
let inspAId: number;
let inspBId: number;
const base = '/api/inspections';
// Authenticated mutations need a matching Origin to clear the CSRF check first.
const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
  propAId = (await prisma.property.create({ data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' } })).id;
  propBId = (await prisma.property.create({ data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' } })).id;
  inspAId = (await prisma.inspection.create({ data: { companyId: t.companyA, propertyId: propAId, nextInspectionDate: new Date('2026-02-01') } })).id;
  inspBId = (await prisma.inspection.create({ data: { companyId: t.companyB, propertyId: propBId, nextInspectionDate: new Date('2026-02-01') } })).id;
});

describe('Integration · company-wide inspections (read-only)', () => {
  it('unauthenticated → 401', async () => {
    expect((await request(app).get(base)).status).toBe(401);
  });

  it('RENTER → 403; SUPER_ADMIN → 403', async () => {
    expect((await request(app).get(base).set('Cookie', renterA)).status).toBe(403);
    expect((await request(app).get(base).set('Cookie', superAdmin)).status).toBe(403);
  });

  it('WORKER can read (200)', async () => {
    expect((await request(app).get(base).set('Cookie', workerA)).status).toBe(200);
  });

  it('manager A sees only company A inspections', async () => {
    const res = await request(app).get(base).set('Cookie', managerA);
    expect(res.status).toBe(200);
    const rows = res.body.inspections as Array<{ id: number; companyId: number }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(inspAId);
    expect(rows.every((i) => i.companyId === t.companyA)).toBe(true);
  });

  it('never returns another company’s inspection', async () => {
    const res = await request(app).get(base).set('Cookie', managerA);
    const ids = (res.body.inspections as Array<{ id: number }>).map((i) => i.id);
    expect(ids).not.toContain(inspBId);
    expect(JSON.stringify(res.body)).not.toContain('Eilat');
  });

  it('does not expose write verbs (404)', async () => {
    expect((await request(app).post(base).set('Cookie', managerA).set('Origin', ORIGIN)).status).toBe(404);
    expect((await request(app).patch(`${base}/${inspAId}`).set('Cookie', managerA).set('Origin', ORIGIN)).status).toBe(404);
    expect((await request(app).delete(`${base}/${inspAId}`).set('Cookie', managerA).set('Origin', ORIGIN)).status).toBe(404);
  });
});
