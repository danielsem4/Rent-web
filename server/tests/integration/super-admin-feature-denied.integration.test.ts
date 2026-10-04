import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { resetDatabase, seedTenants, loginAs, createTestApp, type SeededTenants } from './helpers/db';

// A SUPER_ADMIN is platform-scoped (companyId null) and must stay 403'd out of the
// company-scoped feature routes — and must NEVER 500 on the null companyId.

const app = createTestApp();
let t: SeededTenants;
let superAdmin: string[];

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  superAdmin = (await loginAs(app, t.superAdmin.email)).cookie;
});

describe('Integration · SUPER_ADMIN denied on company-scoped features', () => {
  it('→ 403 (not 500) on properties/workers/payments/inspections/users', async () => {
    for (const path of ['/api/properties', '/api/workers', '/api/payments', '/api/inspections', '/api/users']) {
      const res = await request(app).get(path).set('Cookie', superAdmin);
      expect(res.status).toBe(403);
    }
  });

  it('can reach its own admin area', async () => {
    expect((await request(app).get('/api/admin/companies').set('Cookie', superAdmin)).status).toBe(200);
  });

  it('/me reports a null company and empty modules for the platform admin', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', superAdmin);
    expect(res.status).toBe(200);
    expect(res.body.user.companyId).toBeNull();
    expect(res.body.user.enabledModules).toEqual([]);
  });
});
