import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// Real-DB proof of Property tenant isolation + role authorization (the negative
// tests the security policy requires: cross-tenant access denied, worker write
// denied, renter denied). Drives the full HTTP → authenticate → authorize →
// service → Prisma → PostgreSQL stack.

const app = createTestApp();
let t: SeededTenants;
let managerA: string[];
let workerA: string[];
let renterA: string[];
let propAId: number;
let propBId: number;
const ORIGIN = 'http://localhost:5173';

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie; // non-privileged, one-step login
  renterA = (await loginAs(app, t.renterA.email)).cookie;

  // Seed one property per company directly in the DB.
  const a = await prisma.property.create({
    data: { companyId: t.companyA, city: 'Tel Aviv', address: '1 Herzl St', entryCode: 'A-SECRET' },
  });
  const b = await prisma.property.create({
    data: { companyId: t.companyB, city: 'Eilat', address: '9 Beach Rd', entryCode: 'B-SECRET' },
  });
  propAId = a.id;
  propBId = b.id;
});

// ===========================================================================
// Role authorization
// ===========================================================================
describe('Integration · property role authorization', () => {
  it('a COMPANY_WORKER can read (read-only)', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', workerA);
    expect(res.status).toBe(200);
  });

  it('a COMPANY_WORKER cannot create (403), nothing written', async () => {
    const before = await prisma.property.count({ where: { companyId: t.companyA } });
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', workerA)
      .set('Origin', ORIGIN)
      .send({ city: 'Netanya', address: '3 Sea St' });
    expect(res.status).toBe(403);
    expect(await prisma.property.count({ where: { companyId: t.companyA } })).toBe(before);
  });

  it('a COMPANY_WORKER cannot delete (403); row survives in PostgreSQL', async () => {
    const res = await request(app)
      .delete(`/api/properties/${propAId}`)
      .set('Cookie', workerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(403);
    expect(await prisma.property.findUnique({ where: { id: propAId } })).not.toBeNull();
  });

  it('a RENTER is forbidden entirely (403)', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', renterA);
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Tenant isolation — list + read
// ===========================================================================
describe('Integration · property list & read isolation', () => {
  it('Company A manager sees only Company A properties, entryCode omitted', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', managerA);
    expect(res.status).toBe(200);
    const rows = res.body.properties as Array<{ id: number; companyId: number }>;
    expect(rows.map((p) => p.id)).toEqual([propAId]);
    expect(rows.every((p) => p.companyId === t.companyA)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('A-SECRET'); // entryCode never in list
  });

  it('Company A manager reading a Company B property → 404 (existence not revealed)', async () => {
    const res = await request(app).get(`/api/properties/${propBId}`).set('Cookie', managerA);
    expect(res.status).toBe(404);
  });

  it('Company A manager reading a Company A property gets full detail incl. entryCode', async () => {
    const res = await request(app).get(`/api/properties/${propAId}`).set('Cookie', managerA);
    expect(res.status).toBe(200);
    expect(res.body.property.entryCode).toBe('A-SECRET');
  });
});

// ===========================================================================
// Tenant isolation — write (create / update / delete)
// ===========================================================================
describe('Integration · property write isolation', () => {
  it('created property belongs to the manager’s company; a hostile companyId is ignored', async () => {
    const bBefore = await prisma.property.count({ where: { companyId: t.companyB } });
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ city: 'Ashdod', address: '7 Port Ave', companyId: t.companyB });

    expect(res.status).toBe(201);
    const row = await prisma.property.findUnique({ where: { id: res.body.property.id } });
    expect(row?.companyId).toBe(t.companyA);
    expect(await prisma.property.count({ where: { companyId: t.companyB } })).toBe(bBefore);
  });

  it('a create is recorded in the real AuditLog table (PROPERTY_CREATED)', async () => {
    await request(app)
      .post('/api/properties')
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ city: 'Bat Yam', address: '2 Ridge St', entryCode: 'NEVER-LOGGED' });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'PROPERTY_CREATED' } });
    expect(audit).not.toBeNull();
    expect(audit?.companyId).toBe(t.companyA);
    // The secret value must never reach the trail — only field names are stored.
    expect(JSON.stringify(audit?.metadata)).not.toContain('NEVER-LOGGED');
  });

  it('cannot update a Company B property (404); DB row byte-identical', async () => {
    const before = await prisma.property.findUnique({ where: { id: propBId } });
    const res = await request(app)
      .patch(`/api/properties/${propBId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send({ city: 'HACKED' });
    expect(res.status).toBe(404);
    const after = await prisma.property.findUnique({ where: { id: propBId } });
    expect(after).toEqual(before);
  });

  it('cannot delete a Company B property (404); row survives', async () => {
    const res = await request(app)
      .delete(`/api/properties/${propBId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(await prisma.property.findUnique({ where: { id: propBId } })).not.toBeNull();
  });

  it('can delete a Company A property (204); row gone from PostgreSQL', async () => {
    const res = await request(app)
      .delete(`/api/properties/${propAId}`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(await prisma.property.findUnique({ where: { id: propAId } })).toBeNull();
  });
});
