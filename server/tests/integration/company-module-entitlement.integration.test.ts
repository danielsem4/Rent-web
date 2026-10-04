import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import {
  resetDatabase,
  seedCompanyWithModules,
  loginAs,
  createTestApp,
} from './helpers/db';
import { MODULE_KEYS } from '../../src/shared/modules/registry';

// Server-side feature-module enforcement (modular multi-tenancy). A company that
// is NOT entitled to a module must be denied (403) on that module's routes — the
// real boundary (requireModule), independent of role. Fail closed.

const app = createTestApp();
const ORIGIN = 'http://localhost:5173';

describe('Integration · company feature-module entitlement (staff principal)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('company WITHOUT core-rent → 403 on properties/payments/inspections', async () => {
    const co = await seedCompanyWithModules('Workers Only Co', [MODULE_KEYS.FOREIGN_WORKERS], 'core403');
    const manager = (await loginAs(app, co.manager.email)).cookie;

    expect((await request(app).get('/api/properties').set('Cookie', manager)).status).toBe(403);
    expect((await request(app).get('/api/payments').set('Cookie', manager)).status).toBe(403);
    expect((await request(app).get('/api/inspections').set('Cookie', manager)).status).toBe(403);
    // Foreign-workers IS entitled → that module's route is reachable (positive control).
    expect((await request(app).get('/api/workers').set('Cookie', manager)).status).toBe(200);
  });

  it('company WITHOUT foreign-workers → 403 on workers', async () => {
    const co = await seedCompanyWithModules('Rent Only Co', [MODULE_KEYS.CORE_RENT], 'fw403');
    const manager = (await loginAs(app, co.manager.email)).cookie;

    expect((await request(app).get('/api/workers').set('Cookie', manager)).status).toBe(403);
    // Core-rent IS entitled → reachable (positive control).
    expect((await request(app).get('/api/properties').set('Cookie', manager)).status).toBe(200);
  });

  it('company with NO modules → 403 on every feature route', async () => {
    const co = await seedCompanyWithModules('Empty Co', [], 'empty');
    const manager = (await loginAs(app, co.manager.email)).cookie;

    for (const path of ['/api/properties', '/api/payments', '/api/inspections', '/api/workers']) {
      expect((await request(app).get(path).set('Cookie', manager)).status).toBe(403);
    }
  });

  it('mid-session module disable fails closed on the NEXT request', async () => {
    const co = await seedCompanyWithModules('Rent Co', [MODULE_KEYS.CORE_RENT], 'middis');
    const manager = (await loginAs(app, co.manager.email)).cookie;

    // Entitled now → 200.
    expect((await request(app).get('/api/properties').set('Cookie', manager)).status).toBe(200);

    // Platform admin disables the module (simulated directly in the DB). The same
    // cookie is reused — authenticate re-reads entitlements every request.
    await prisma.companyModule.update({
      where: { companyId_moduleKey: { companyId: co.companyId, moduleKey: MODULE_KEYS.CORE_RENT } },
      data: { enabled: false },
    });

    expect((await request(app).get('/api/properties').set('Cookie', manager)).status).toBe(403);
  });

  it('disabling the whole company locks its users out on the next request', async () => {
    const co = await seedCompanyWithModules('Disable Co', [MODULE_KEYS.CORE_RENT], 'coDisable');
    const manager = (await loginAs(app, co.manager.email)).cookie;
    expect((await request(app).get('/api/properties').set('Cookie', manager)).status).toBe(200);

    await prisma.company.update({ where: { id: co.companyId }, data: { isActive: false } });

    // authenticate fails closed with a generic 401 for a disabled company.
    expect((await request(app).get('/api/properties').set('Cookie', manager)).status).toBe(401);
  });

  it('Origin check still applies to writes (sanity)', async () => {
    const co = await seedCompanyWithModules('Rent Co2', [MODULE_KEYS.CORE_RENT], 'origin');
    const manager = (await loginAs(app, co.manager.email)).cookie;
    // A write WITHOUT the Origin header is rejected regardless of entitlement.
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', manager)
      .send({ city: 'X', address: 'Y' });
    expect(res.status).toBe(403);
  });
});
