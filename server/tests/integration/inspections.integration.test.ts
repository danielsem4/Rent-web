import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Tenant isolation + role authorization for the periodic-inspections sub-resource.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
let insAId: number;
let insBId: number;
const ORIGIN = 'http://localhost:5173';
const base = (propertyId: number) => `/api/properties/${propertyId}/inspections`;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
  propAId = (await prisma.property.create({ data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' } })).id;
  propBId = (await prisma.property.create({ data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' } })).id;
  insAId = (await prisma.inspection.create({ data: { companyId: t.companyA, propertyId: propAId, nextInspectionDate: new Date('2026-06-01') } })).id;
  insBId = (await prisma.inspection.create({ data: { companyId: t.companyB, propertyId: propBId, nextInspectionDate: new Date('2026-07-01') } })).id;
});

describe('Integration · inspections isolation & authorization', () => {
  it('unauthenticated → 401', async () => {
    expect((await request(app).get(base(propAId))).status).toBe(401);
  });
  it('RENTER → 403; SUPER_ADMIN → 403', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', renterA)).status).toBe(403);
    expect((await request(app).get(base(propAId)).set('Cookie', superAdmin)).status).toBe(403);
  });
  it('WORKER read-only (create 403; nothing written)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', workerA)).status).toBe(200);
    const before = await prisma.inspection.count({ where: { companyId: t.companyA } });
    const res = await request(app).post(base(propAId)).set('Cookie', workerA).set('Origin', ORIGIN).send({ nextInspectionDate: '2026-09-01' });
    expect(res.status).toBe(403);
    expect(await prisma.inspection.count({ where: { companyId: t.companyA } })).toBe(before);
  });
  it('manager A lists only company A inspections', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect((res.body.inspections as Array<{ id: number }>).map((r) => r.id)).toEqual([insAId]);
  });
  it('cross-tenant via parent → 404; IDOR by id → 404', async () => {
    expect((await request(app).get(base(propBId)).set('Cookie', managerA)).status).toBe(404);
    expect((await request(app).get(`${base(propAId)}/${insBId}`).set('Cookie', managerA)).status).toBe(404);
  });
  it('create ignores hostile ownership keys; 201 scoped to company A', async () => {
    const res = await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN)
      .send({ lastInspectionDate: '2026-01-01', nextInspectionDate: '2026-07-01', companyId: t.companyB, propertyId: propBId });
    expect(res.status).toBe(201);
    const row = await prisma.inspection.findUnique({ where: { id: res.body.inspection.id } });
    expect(row?.companyId).toBe(t.companyA);
    expect(row?.propertyId).toBe(propAId);
  });
  it('create with no dates → 400 (at least one date required)', async () => {
    expect((await request(app).post(base(propAId)).set('Cookie', managerA).set('Origin', ORIGIN).send({ notes: 'x' })).status).toBe(400);
  });
  it('cannot update/delete a company B inspection (404; unchanged/surviving)', async () => {
    const before = await prisma.inspection.findUnique({ where: { id: insBId } });
    expect((await request(app).patch(`${base(propBId)}/${insBId}`).set('Cookie', managerA).set('Origin', ORIGIN).send({ notes: 'HACKED' })).status).toBe(404);
    expect(await prisma.inspection.findUnique({ where: { id: insBId } })).toEqual(before);
    expect((await request(app).delete(`${base(propBId)}/${insBId}`).set('Cookie', managerA).set('Origin', ORIGIN)).status).toBe(404);
    expect(await prisma.inspection.findUnique({ where: { id: insBId } })).not.toBeNull();
  });
});
