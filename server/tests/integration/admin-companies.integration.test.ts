import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import {
  resetDatabase,
  seedTenants,
  loginAs,
  createTestApp,
  testMailer,
  type SeededTenants,
} from './helpers/db';
import { MODULE_KEYS } from '../../src/shared/modules/registry';

// Platform-admin company management (/api/admin/companies). SUPER_ADMIN only;
// every other principal is denied. Cross-tenant by design (company id from path).

const app = createTestApp();
const ORIGIN = 'http://localhost:5173';
let t: SeededTenants;
let superAdmin: string[];
let managerA: string[];
let workerA: string[];
let renterA: string[];

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  workerA = (await loginAs(app, t.workerA.email)).cookie;
  renterA = (await loginAs(app, t.renterA.email)).cookie;
});

describe('Integration · admin companies authorization', () => {
  it('unauthenticated → 401', async () => {
    expect((await request(app).get('/api/admin/companies')).status).toBe(401);
  });

  it('non-super-admin roles → 403 on every admin route', async () => {
    for (const cookie of [managerA, workerA, renterA]) {
      expect((await request(app).get('/api/admin/companies').set('Cookie', cookie)).status).toBe(403);
      expect(
        (await request(app).post('/api/admin/companies').set('Cookie', cookie).set('Origin', ORIGIN).send({ name: 'X' })).status,
      ).toBe(403);
      expect((await request(app).get(`/api/admin/companies/${t.companyA}`).set('Cookie', cookie)).status).toBe(403);
      expect(
        (await request(app).put(`/api/admin/companies/${t.companyA}/modules`).set('Cookie', cookie).set('Origin', ORIGIN).send({ modules: [] })).status,
      ).toBe(403);
      expect(
        (await request(app).post(`/api/admin/companies/${t.companyA}/managers`).set('Cookie', cookie).set('Origin', ORIGIN).send({ email: 'x@y.z', name: 'X' })).status,
      ).toBe(403);
    }
  });
});

describe('Integration · admin companies functionality (SUPER_ADMIN)', () => {
  it('lists companies with their enabled modules + manager count', async () => {
    const res = await request(app).get('/api/admin/companies').set('Cookie', superAdmin);
    expect(res.status).toBe(200);
    const a = (res.body.companies as Array<{ id: number; moduleKeys: string[]; managerCount: number }>).find((c) => c.id === t.companyA);
    expect(a).toBeTruthy();
    expect(a!.moduleKeys.sort()).toEqual([MODULE_KEYS.CORE_RENT, MODULE_KEYS.FOREIGN_WORKERS].sort());
    expect(a!.managerCount).toBe(1);
  });

  it('creates a company with selected modules + a first manager (invitation emailed)', async () => {
    testMailer.reset();
    const res = await request(app)
      .post('/api/admin/companies')
      .set('Cookie', superAdmin)
      .set('Origin', ORIGIN)
      .send({ name: 'New Tenant', modules: [MODULE_KEYS.CORE_RENT], manager: { email: 'owner@new.co', name: 'Owner' } });
    expect(res.status).toBe(201);
    const companyId = res.body.company.id as number;
    expect(res.body.company.moduleKeys).toEqual([MODULE_KEYS.CORE_RENT]);
    expect(res.body.company.managers).toHaveLength(1);

    // Entitlement row persisted.
    const rows = await prisma.companyModule.findMany({ where: { companyId, enabled: true } });
    expect(rows.map((r) => r.moduleKey)).toEqual([MODULE_KEYS.CORE_RENT]);

    // Manager created pending (inactive) with the right company + role, invitation mailed.
    const manager = await prisma.user.findUnique({ where: { email: 'owner@new.co' } });
    expect(manager?.companyId).toBe(companyId);
    expect(manager?.role).toBe('COMPANY_MANAGER');
    expect(manager?.isActive).toBe(false);
    expect(testMailer.delivered.some((m) => m.kind === 'invitation' && m.to === 'owner@new.co')).toBe(true);
  });

  it('PUT /modules replaces the enabled set (idempotent) and persists rows', async () => {
    // Company A starts with both modules; set it to core-rent only.
    const res = await request(app)
      .put(`/api/admin/companies/${t.companyA}/modules`)
      .set('Cookie', superAdmin)
      .set('Origin', ORIGIN)
      .send({ modules: [MODULE_KEYS.CORE_RENT] });
    expect(res.status).toBe(200);
    expect(res.body.company.moduleKeys).toEqual([MODULE_KEYS.CORE_RENT]);

    const enabled = await prisma.companyModule.findMany({ where: { companyId: t.companyA, enabled: true } });
    expect(enabled.map((r) => r.moduleKey)).toEqual([MODULE_KEYS.CORE_RENT]);
    // foreign-workers row kept but disabled (auditable history).
    const fw = await prisma.companyModule.findUnique({
      where: { companyId_moduleKey: { companyId: t.companyA, moduleKey: MODULE_KEYS.FOREIGN_WORKERS } },
    });
    expect(fw?.enabled).toBe(false);
  });

  it('disabling a company locks out its manager on the next request', async () => {
    const res = await request(app)
      .patch(`/api/admin/companies/${t.companyA}`)
      .set('Cookie', superAdmin)
      .set('Origin', ORIGIN)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.company.isActive).toBe(false);

    // Company A's manager (already logged in) is denied on the next request.
    expect((await request(app).get('/api/properties').set('Cookie', managerA)).status).toBe(401);
  });

  it('rejects an unknown module key (400)', async () => {
    const res = await request(app)
      .put(`/api/admin/companies/${t.companyA}/modules`)
      .set('Cookie', superAdmin)
      .set('Origin', ORIGIN)
      .send({ modules: ['not-a-real-module'] });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown company id', async () => {
    expect((await request(app).get('/api/admin/companies/999999').set('Cookie', superAdmin)).status).toBe(404);
  });
});
