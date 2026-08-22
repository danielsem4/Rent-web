import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Tenant isolation + role authorization for the equipment sub-resource (full CRUD
// — the panel with an add/remove UI). Negative tests per Definition of Done §30.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
let itemAId: number;
let itemBId: number;
const ORIGIN = 'http://localhost:5173';

const base = (propertyId: number) => `/api/properties/${propertyId}/equipment`;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;

  propAId = (await prisma.property.create({ data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' } })).id;
  propBId = (await prisma.property.create({ data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' } })).id;
  itemAId = (await prisma.equipment.create({ data: { companyId: t.companyA, propertyId: propAId, name: 'Fridge', quantity: 1 } })).id;
  itemBId = (await prisma.equipment.create({ data: { companyId: t.companyB, propertyId: propBId, name: 'Oven', quantity: 1 } })).id;
});

describe('Integration · equipment role authorization', () => {
  it('unauthenticated read → 401', async () => {
    expect((await request(app).get(base(propAId))).status).toBe(401);
  });
  it('RENTER → 403', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', renterA)).status).toBe(403);
  });
  it('SUPER_ADMIN → 403', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', superAdmin)).status).toBe(403);
  });
  it('WORKER can read but not write (403); nothing written', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', workerA)).status).toBe(200);
    const before = await prisma.equipment.count({ where: { companyId: t.companyA } });
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', workerA)
      .set('Origin', ORIGIN)
      .send({ name: 'Sofa' });
    expect(res.status).toBe(403);
    expect(await prisma.equipment.count({ where: { companyId: t.companyA } })).toBe(before);
  });
});

describe('Integration · equipment tenant isolation', () => {
  it('manager A lists only company A items', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect(res.status).toBe(200);
    expect((res.body.equipment as Array<{ id: number }>).map((r) => r.id)).toEqual([itemAId]);
  });
  it('cross-tenant via parent property → 404', async () => {
    expect((await request(app).get(base(propBId)).set('Cookie', managerA)).status).toBe(404);
  });
  it('IDOR: company B item under company A property → 404', async () => {
    expect((await request(app).get(`${base(propAId)}/${itemBId}`).set('Cookie', managerA)).status).toBe(404);
  });
  it('create + delete round-trips for own company', async () => {
    const created = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ name: 'Washer', quantity: 2, condition: 'GOOD', companyId: t.companyB });
    expect(created.status).toBe(201);
    expect(created.body.equipment.companyId).toBe(t.companyA); // hostile companyId ignored
    const del = await request(app)
      .delete(`${base(propAId)}/${created.body.equipment.id}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(del.status).toBe(204);
  });
  it('cannot delete a company B item (404); row survives', async () => {
    const res = await request(app).delete(`${base(propBId)}/${itemBId}`).set('Cookie', managerA).set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(await prisma.equipment.findUnique({ where: { id: itemBId } })).not.toBeNull();
  });
  it('cannot update a company B item (404); row byte-identical', async () => {
    const before = await prisma.equipment.findUnique({ where: { id: itemBId } });
    const res = await request(app).patch(`${base(propBId)}/${itemBId}`).set('Cookie', managerA).set('Origin', ORIGIN).send({ name: 'HACKED' });
    expect(res.status).toBe(404);
    expect(await prisma.equipment.findUnique({ where: { id: itemBId } })).toEqual(before);
  });
  it('records EQUIPMENT_CREATED in AuditLog for company A', async () => {
    await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN).send({ name: 'Kettle' });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'EQUIPMENT_CREATED' } });
    expect(audit?.companyId).toBe(t.companyA);
  });
  it('invalid condition enum → 400', async () => {
    const res = await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN).send({ name: 'X', condition: 'NOPE' });
    expect(res.status).toBe(400);
  });
});
