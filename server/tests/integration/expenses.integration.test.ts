import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Tenant isolation + role authorization for the miscellaneous-expenses sub-resource.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
let expAId: number;
let expBId: number;
const ORIGIN = 'http://localhost:5173';
const base = (propertyId: number) => `/api/properties/${propertyId}/expenses`;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
  propAId = (await prisma.property.create({ data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' } })).id;
  propBId = (await prisma.property.create({ data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' } })).id;
  expAId = (await prisma.expense.create({ data: { companyId: t.companyA, propertyId: propAId, category: 'CLEANING', amount: 200, date: new Date('2026-01-10') } })).id;
  expBId = (await prisma.expense.create({ data: { companyId: t.companyB, propertyId: propBId, category: 'MAINTENANCE', amount: 400, date: new Date('2026-01-11') } })).id;
});

describe('Integration · expenses isolation & authorization', () => {
  it('unauthenticated → 401', async () => {
    expect((await request(app).get(base(propAId))).status).toBe(401);
  });
  it('RENTER → 403; SUPER_ADMIN → 403', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', renterA)).status).toBe(403);
    expect((await request(app).get(base(propAId)).set('Cookie', superAdmin)).status).toBe(403);
  });
  it('WORKER read-only (create 403; nothing written)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', workerA)).status).toBe(200);
    const before = await prisma.expense.count({ where: { companyId: t.companyA } });
    const res = await request(app).post(base(propAId)).set('Cookie', workerA).set('Origin', ORIGIN).send({ category: 'OTHER', amount: 10, date: '2026-02-01' });
    expect(res.status).toBe(403);
    expect(await prisma.expense.count({ where: { companyId: t.companyA } })).toBe(before);
  });
  it('manager A lists only company A expenses', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect((res.body.expenses as Array<{ id: number }>).map((r) => r.id)).toEqual([expAId]);
  });
  it('cross-tenant via parent → 404; IDOR by id → 404', async () => {
    expect((await request(app).get(base(propBId)).set('Cookie', managerA)).status).toBe(404);
    expect((await request(app).get(`${base(propAId)}/${expBId}`).set('Cookie', managerA)).status).toBe(404);
  });
  it('create ignores hostile ownership keys; 201 scoped to company A', async () => {
    const res = await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN)
      .send({ category: 'PEST_CONTROL', amount: 320, date: '2026-03-01', companyId: t.companyB, propertyId: propBId });
    expect(res.status).toBe(201);
    const row = await prisma.expense.findUnique({ where: { id: res.body.expense.id } });
    expect(row?.companyId).toBe(t.companyA);
    expect(row?.propertyId).toBe(propAId);
  });
  it('cannot update/delete a company B expense (404; unchanged/surviving)', async () => {
    const before = await prisma.expense.findUnique({ where: { id: expBId } });
    expect((await request(app).patch(`${base(propBId)}/${expBId}`).set('Cookie', managerA).set('Origin', ORIGIN).send({ amount: 1 })).status).toBe(404);
    expect(await prisma.expense.findUnique({ where: { id: expBId } })).toEqual(before);
    expect((await request(app).delete(`${base(propBId)}/${expBId}`).set('Cookie', managerA).set('Origin', ORIGIN)).status).toBe(404);
    expect(await prisma.expense.findUnique({ where: { id: expBId } })).not.toBeNull();
  });
  it('invalid category enum → 400; missing date → 400', async () => {
    expect((await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN).send({ category: 'NOPE', amount: 1, date: '2026-01-01' })).status).toBe(400);
    expect((await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN).send({ category: 'CLEANING', amount: 1 })).status).toBe(400);
  });
});
