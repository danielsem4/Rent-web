import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Read-only, property-scoped rent history: GET /api/properties/:propertyId/payments.
// Verifies tenant isolation, cross-tenant-via-parent 404, and role authorization.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
const base = (propertyId: number) => `/api/properties/${propertyId}/payments`;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
  propAId = (await prisma.property.create({ data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' } })).id;
  propBId = (await prisma.property.create({ data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' } })).id;
  await prisma.payment.create({ data: { companyId: t.companyA, propertyId: propAId, amount: 5200, dueDate: new Date('2026-01-01') } });
  await prisma.payment.create({ data: { companyId: t.companyB, propertyId: propBId, amount: 4000, dueDate: new Date('2026-01-01') } });
});

describe('Integration · property-scoped payments (read-only)', () => {
  it('unauthenticated → 401', async () => {
    expect((await request(app).get(base(propAId))).status).toBe(401);
  });
  it('RENTER → 403; SUPER_ADMIN → 403', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', renterA)).status).toBe(403);
    expect((await request(app).get(base(propAId)).set('Cookie', superAdmin)).status).toBe(403);
  });
  it('WORKER can read (200)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', workerA)).status).toBe(200);
  });
  it('manager A sees only company A payments for the property', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect(res.status).toBe(200);
    const rows = res.body.payments as Array<{ propertyId: number; companyId: number }>;
    expect(rows.length).toBe(1);
    expect(rows.every((p) => p.companyId === t.companyA && p.propertyId === propAId)).toBe(true);
  });
  it('cross-tenant via parent property → 404', async () => {
    expect((await request(app).get(base(propBId)).set('Cookie', managerA)).status).toBe(404);
  });
});
