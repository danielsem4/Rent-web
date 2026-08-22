import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Tenant isolation + role authorization for the guarantees/deposits sub-resource.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
let gtAId: number;
let gtBId: number;
const ORIGIN = 'http://localhost:5173';
const base = (propertyId: number) => `/api/properties/${propertyId}/guarantees`;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
  propAId = (await prisma.property.create({ data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' } })).id;
  propBId = (await prisma.property.create({ data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' } })).id;
  gtAId = (await prisma.guarantee.create({ data: { companyId: t.companyA, propertyId: propAId, type: 'BANK_GUARANTEE', amount: 5000 } })).id;
  gtBId = (await prisma.guarantee.create({ data: { companyId: t.companyB, propertyId: propBId, type: 'CASH_DEPOSIT', amount: 3000 } })).id;
});

describe('Integration · guarantees isolation & authorization', () => {
  it('unauthenticated → 401', async () => {
    expect((await request(app).get(base(propAId))).status).toBe(401);
  });
  it('RENTER → 403; SUPER_ADMIN → 403', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', renterA)).status).toBe(403);
    expect((await request(app).get(base(propAId)).set('Cookie', superAdmin)).status).toBe(403);
  });
  it('WORKER read-only (create 403; nothing written)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', workerA)).status).toBe(200);
    const before = await prisma.guarantee.count({ where: { companyId: t.companyA } });
    const res = await request(app).post(base(propAId)).set('Cookie', workerA).set('Origin', ORIGIN).send({ type: 'CHECK', amount: 100 });
    expect(res.status).toBe(403);
    expect(await prisma.guarantee.count({ where: { companyId: t.companyA } })).toBe(before);
  });
  it('manager A lists only company A guarantees', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect((res.body.guarantees as Array<{ id: number }>).map((r) => r.id)).toEqual([gtAId]);
  });
  it('cross-tenant via parent → 404; IDOR by id → 404', async () => {
    expect((await request(app).get(base(propBId)).set('Cookie', managerA)).status).toBe(404);
    expect((await request(app).get(`${base(propAId)}/${gtBId}`).set('Cookie', managerA)).status).toBe(404);
  });
  it('create ignores hostile ownership keys; 201 scoped to company A', async () => {
    const res = await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN)
      .send({ type: 'CASH_DEPOSIT', amount: 750, companyId: t.companyB, propertyId: propBId });
    expect(res.status).toBe(201);
    const row = await prisma.guarantee.findUnique({ where: { id: res.body.guarantee.id } });
    expect(row?.companyId).toBe(t.companyA);
    expect(row?.propertyId).toBe(propAId);
  });
  it('cannot update/delete a company B guarantee (404; unchanged/surviving)', async () => {
    const before = await prisma.guarantee.findUnique({ where: { id: gtBId } });
    expect((await request(app).patch(`${base(propBId)}/${gtBId}`).set('Cookie', managerA).set('Origin', ORIGIN).send({ amount: 1 })).status).toBe(404);
    expect(await prisma.guarantee.findUnique({ where: { id: gtBId } })).toEqual(before);
    expect((await request(app).delete(`${base(propBId)}/${gtBId}`).set('Cookie', managerA).set('Origin', ORIGIN)).status).toBe(404);
    expect(await prisma.guarantee.findUnique({ where: { id: gtBId } })).not.toBeNull();
  });
  it('invalid enum → 400', async () => {
    expect((await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN).send({ type: 'NOPE', amount: 1 })).status).toBe(400);
  });
});
