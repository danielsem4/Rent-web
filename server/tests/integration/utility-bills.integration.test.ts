import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Real-DB proof of tenant isolation + role authorization for the utility-bills
// sub-resource — the canonical property-scoped module. Covers the negative tests
// the security policy (Definition of Done §30) requires: unauth, role denial,
// cross-tenant (direct + via parent property), IDOR, mass-assignment, audit.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let managerB: string[];
let superAdmin: string[];
let propAId: number;
let propBId: number;
let billAId: number;
let billBId: number;
const ORIGIN = 'http://localhost:5173';

const base = (propertyId: number) => `/api/properties/${propertyId}/utility-bills`;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
  managerB = (await loginAs(app, t.managerB.email)).cookie;
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;

  const a = await prisma.property.create({
    data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' },
  });
  const b = await prisma.property.create({
    data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' },
  });
  propAId = a.id;
  propBId = b.id;

  const billA = await prisma.utilityBill.create({
    data: { companyId: t.companyA, propertyId: propAId, type: 'ELECTRICITY', amount: 300, dueDate: new Date('2026-01-15') },
  });
  const billB = await prisma.utilityBill.create({
    data: { companyId: t.companyB, propertyId: propBId, type: 'WATER', amount: 120, dueDate: new Date('2026-02-01') },
  });
  billAId = billA.id;
  billBId = billB.id;
});

describe('Integration · utility-bills authentication & role authorization', () => {
  it('unauthenticated read → 401', async () => {
    expect((await request(app).get(base(propAId))).status).toBe(401);
  });

  it('unauthenticated write → 401', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: 50, dueDate: '2026-03-01' });
    expect(res.status).toBe(401);
  });

  it('a RENTER is forbidden entirely (403)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', renterA)).status).toBe(403);
  });

  it('a SUPER_ADMIN is forbidden (403 — intentionally excluded)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', superAdmin)).status).toBe(403);
  });

  it('a COMPANY_WORKER can read (200)', async () => {
    expect((await request(app).get(base(propAId)).set('Cookie', workerA)).status).toBe(200);
  });

  it('a COMPANY_WORKER cannot create (403); nothing written', async () => {
    const before = await prisma.utilityBill.count({ where: { companyId: t.companyA } });
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', workerA)
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: 50, dueDate: '2026-03-01' });
    expect(res.status).toBe(403);
    expect(await prisma.utilityBill.count({ where: { companyId: t.companyA } })).toBe(before);
  });

  it('a COMPANY_WORKER cannot delete (403); row survives', async () => {
    const res = await request(app)
      .delete(`${base(propAId)}/${billAId}`)
      .set('Cookie', workerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(403);
    expect(await prisma.utilityBill.findUnique({ where: { id: billAId } })).not.toBeNull();
  });
});

describe('Integration · utility-bills tenant isolation (list & read)', () => {
  it('Company A manager lists only Company A bills', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect(res.status).toBe(200);
    const rows = res.body.utilityBills as Array<{ id: number }>;
    expect(rows.map((r) => r.id)).toEqual([billAId]);
  });

  it('derives an overdue flag at read time (PENDING + past due)', async () => {
    const res = await request(app).get(base(propAId)).set('Cookie', managerA);
    expect(res.body.utilityBills[0].overdue).toBe(true); // dueDate 2026-01-15, today is later
  });

  it('reading a Company B bill by id → 404 (existence not revealed)', async () => {
    const res = await request(app).get(`${base(propAId)}/${billBId}`).set('Cookie', managerA);
    expect(res.status).toBe(404);
  });

  it('cross-tenant via parent: listing under a Company B property → 404', async () => {
    const res = await request(app).get(base(propBId)).set('Cookie', managerA);
    expect(res.status).toBe(404);
  });

  it('IDOR: a Company B bill id under Company A property → 404', async () => {
    const res = await request(app).get(`${base(propAId)}/${billBId}`).set('Cookie', managerA);
    expect(res.status).toBe(404);
  });
});

describe('Integration · utility-bills write isolation', () => {
  it('create under own property succeeds (201) with trusted scope', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: 80, dueDate: '2026-03-01' });
    expect(res.status).toBe(201);
    const row = await prisma.utilityBill.findUnique({ where: { id: res.body.utilityBill.id } });
    expect(row?.companyId).toBe(t.companyA);
    expect(row?.propertyId).toBe(propAId);
  });

  it('mass-assignment: hostile companyId/propertyId in body are ignored', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'HOA', amount: 200, dueDate: '2026-04-01', companyId: t.companyB, propertyId: propBId, id: 9999 });
    expect(res.status).toBe(201);
    const row = await prisma.utilityBill.findUnique({ where: { id: res.body.utilityBill.id } });
    expect(row?.companyId).toBe(t.companyA);
    expect(row?.propertyId).toBe(propAId);
  });

  it('create under a Company B property → 404; nothing written', async () => {
    const before = await prisma.utilityBill.count({ where: { companyId: t.companyB } });
    const res = await request(app)
      .post(base(propBId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: 50, dueDate: '2026-03-01' });
    expect(res.status).toBe(404);
    expect(await prisma.utilityBill.count({ where: { companyId: t.companyB } })).toBe(before);
  });

  it('cannot update a Company B bill (404); row byte-identical', async () => {
    const before = await prisma.utilityBill.findUnique({ where: { id: billBId } });
    const res = await request(app)
      .patch(`${base(propBId)}/${billBId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ amount: 99999 });
    expect(res.status).toBe(404);
    expect(await prisma.utilityBill.findUnique({ where: { id: billBId } })).toEqual(before);
  });

  it('cannot delete a Company B bill (404); row survives', async () => {
    const res = await request(app)
      .delete(`${base(propBId)}/${billBId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(await prisma.utilityBill.findUnique({ where: { id: billBId } })).not.toBeNull();
  });

  it('a create is recorded in AuditLog (UTILITY_BILL_CREATED), companyId A, values not leaked', async () => {
    await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: 4242, dueDate: '2026-03-01', notes: 'SECRET-NOTE' });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'UTILITY_BILL_CREATED' } });
    expect(audit).not.toBeNull();
    expect(audit?.companyId).toBe(t.companyA);
    expect(JSON.stringify(audit?.metadata)).not.toContain('SECRET-NOTE');
  });
});

describe('Integration · utility-bills validation & CSRF', () => {
  it('invalid enum → 400', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'NOT_A_TYPE', amount: 10, dueDate: '2026-03-01' });
    expect(res.status).toBe(400);
  });

  it('negative amount → 400', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: -5, dueDate: '2026-03-01' });
    expect(res.status).toBe(400);
  });

  it('missing required field (dueDate) → 400', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ type: 'GAS', amount: 10 });
    expect(res.status).toBe(400);
  });

  it('state-changing request without a valid Origin is rejected (CSRF)', async () => {
    const res = await request(app)
      .post(base(propAId))
      .set('Cookie', managerA)
      .send({ type: 'GAS', amount: 10, dueDate: '2026-03-01' });
    expect(res.status).toBe(403);
  });
});
