import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Real-DB proof of Worker tenant isolation, role authorization, and field-level
// encryption of regulated PII (passport / insurance numbers). Drives the full
// HTTP → authenticate → authorize → service → Prisma → PostgreSQL stack.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let workerAId: number;
let workerBId: number;
let propAId: number;
let propBId: number;
const ORIGIN = 'http://localhost:5173';

const PASSPORT = 'TH-PASSPORT-0001';
const POLICY = 'INS-POLICY-7788';

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;

  // One property per company, for apartment-assignment checks.
  const pa = await prisma.property.create({
    data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St' },
  });
  const pb = await prisma.property.create({
    data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd' },
  });
  propAId = pa.id;
  propBId = pb.id;

  // One worker per company. Numbers are written through the service so they are
  // encrypted; seed via the API for Company A, directly for Company B.
  const created = await request(app)
    .post('/api/workers')
    .set('Cookie', managerA)
    .set('Origin', ORIGIN)
    .send({ nameHe: 'עובד א', nameEn: 'Alpha', nationality: 'Thailand', passportNumber: PASSPORT, insurancePolicyNumber: POLICY });
  workerAId = created.body.worker.id;

  const wb = await prisma.worker.create({
    data: { companyId: t.companyB, nameHe: 'עובד ב', nameEn: 'Bravo', nationality: 'India' },
  });
  workerBId = wb.id;
});

// ===========================================================================
// Role authorization
// ===========================================================================
describe('Integration · worker role authorization', () => {
  it('a COMPANY_WORKER can read (read-only)', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', workerA);
    expect(res.status).toBe(200);
  });

  it('a COMPANY_WORKER cannot create (403), nothing written', async () => {
    const before = await prisma.worker.count({ where: { companyId: t.companyA } });
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', workerA)
      .set('Origin', ORIGIN)
      .send({ nameHe: 'x', nameEn: 'x', nationality: 'x' });
    expect(res.status).toBe(403);
    expect(await prisma.worker.count({ where: { companyId: t.companyA } })).toBe(before);
  });

  it('a RENTER is forbidden entirely (403)', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', renterA);
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Field-level encryption at rest + decryption on detail
// ===========================================================================
describe('Integration · worker PII encryption', () => {
  it('stores passport / insurance numbers ENCRYPTED at rest (ciphertext in PostgreSQL)', async () => {
    const row = await prisma.worker.findUnique({ where: { id: workerAId } });
    expect(row?.passportNumberEnc).toBeTruthy();
    expect(row?.passportNumberEnc).not.toContain(PASSPORT);
    expect(row?.insurancePolicyNumEnc).not.toContain(POLICY);
  });

  it('decrypts the numbers on an authorized detail read', async () => {
    const res = await request(app).get(`/api/workers/${workerAId}`).set('Cookie', managerA);
    expect(res.status).toBe(200);
    expect(res.body.worker.passportNumber).toBe(PASSPORT);
    expect(res.body.worker.insurancePolicyNumber).toBe(POLICY);
  });

  it('never returns the numbers in the list projection', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', managerA);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(PASSPORT);
    expect(body).not.toContain(POLICY);
    expect(res.body.workers[0]).not.toHaveProperty('passportNumber');
  });
});

// ===========================================================================
// Tenant isolation
// ===========================================================================
describe('Integration · worker tenant isolation', () => {
  it('Company A manager sees only Company A workers', async () => {
    const res = await request(app).get('/api/workers').set('Cookie', managerA);
    const rows = res.body.workers as Array<{ id: number; companyId: number }>;
    expect(rows.map((w) => w.id)).toEqual([workerAId]);
    expect(rows.every((w) => w.companyId === t.companyA)).toBe(true);
  });

  it('reading a Company B worker → 404 (existence not revealed)', async () => {
    const res = await request(app).get(`/api/workers/${workerBId}`).set('Cookie', managerA);
    expect(res.status).toBe(404);
  });

  it('a hostile companyId in the body is ignored', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ nameHe: 'עובד', nameEn: 'Gamma', nationality: 'Sri Lanka', companyId: t.companyB });
    expect(res.status).toBe(201);
    const row = await prisma.worker.findUnique({ where: { id: res.body.worker.id } });
    expect(row?.companyId).toBe(t.companyA);
  });

  it('cannot update a Company B worker (404); DB row unchanged', async () => {
    const before = await prisma.worker.findUnique({ where: { id: workerBId } });
    const res = await request(app)
      .patch(`/api/workers/${workerBId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ nameEn: 'HACKED' });
    expect(res.status).toBe(404);
    expect(await prisma.worker.findUnique({ where: { id: workerBId } })).toEqual(before);
  });

  it('cannot delete a Company B worker (404); row survives', async () => {
    const res = await request(app)
      .delete(`/api/workers/${workerBId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(await prisma.worker.findUnique({ where: { id: workerBId } })).not.toBeNull();
  });
});

// ===========================================================================
// Apartment-assignment cross-tenant guard
// ===========================================================================
describe('Integration · worker apartment assignment guard', () => {
  it('allows assigning a same-company property', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ nameHe: 'עובד', nameEn: 'Delta', nationality: 'Nepal', propertyId: propAId });
    expect(res.status).toBe(201);
    expect(res.body.worker.propertyId).toBe(propAId);
  });

  it('rejects assigning another company’s property (400); nothing written', async () => {
    const before = await prisma.worker.count({ where: { companyId: t.companyA } });
    const res = await request(app)
      .post('/api/workers')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ nameHe: 'עובד', nameEn: 'Echo', nationality: 'Nepal', propertyId: propBId });
    expect(res.status).toBe(400);
    expect(await prisma.worker.count({ where: { companyId: t.companyA } })).toBe(before);
  });
});

// ===========================================================================
// Audit trail never contains PII values
// ===========================================================================
describe('Integration · worker audit trail', () => {
  it('records WORKER_CREATED without leaking identifier values', async () => {
    const audit = await prisma.auditLog.findFirst({ where: { action: 'WORKER_CREATED' } });
    expect(audit).not.toBeNull();
    expect(audit?.companyId).toBe(t.companyA);
    const meta = JSON.stringify(audit?.metadata);
    expect(meta).not.toContain(PASSPORT);
    expect(meta).not.toContain(POLICY);
  });
});
