import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { testMailer, resetDatabase, seedTenants, loginAs, type SeededTenants } from './helpers/db';
import type { IWhatsAppSender } from '../../src/shared/notifications/whatsapp';
import { MODULE_KEYS } from '../../src/shared/modules/registry';

// Feature-module enforcement for the foreign-worker MOBILE principal. When a
// company loses the foreign-workers module: (a) worker LOGIN must be
// enumeration-safe (identical to an unknown worker — no OTP), and (b) the worker
// PORTAL must fail closed (403/401). SECURITY_PRINCIPLES.md §1/§5/§6.

class CapturingWhatsApp implements IWhatsAppSender {
  sent: Array<{ phone: string; code: string }> = [];
  async sendOtp(toPhoneE164: string, code: string): Promise<void> {
    this.sent.push({ phone: toPhoneE164, code });
  }
  last(): { phone: string; code: string } | undefined {
    return this.sent[this.sent.length - 1];
  }
  reset(): void {
    this.sent.length = 0;
  }
}

const whatsapp = new CapturingWhatsApp();
const app = createApp(undefined, { mailer: testMailer, whatsapp });

const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';
const PHONE = '+972501119988';

let t: SeededTenants;
let managerA: string[];
let workerId: number;

async function loginWorkerByPhone(): Promise<string> {
  whatsapp.reset();
  const start = await request(app).post('/api/worker-auth/phone/start').send({ phone: PHONE });
  expect(start.status).toBe(200);
  const code = whatsapp.last()!.code;
  const verify = await request(app).post('/api/worker-auth/verify').send({ phone: PHONE, code });
  expect(verify.status).toBe(200);
  return verify.body.accessToken as string;
}

beforeEach(async () => {
  await resetDatabase();
  whatsapp.reset();
  t = await seedTenants(); // Company A is entitled to foreign-workers.
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  const worker = await prisma.worker.create({
    data: { companyId: t.companyA, nameHe: 'עובד', nameEn: 'Worker One', nationality: 'Thailand', phone: PHONE },
  });
  workerId = worker.id;
  // Enable app access via the manager (requires the foreign-workers module → OK here).
  const enabled = await request(app)
    .post(`/api/workers/${workerId}/app-access/enable`)
    .set('Cookie', managerA)
    .set('Origin', ORIGIN)
    .send({});
  expect(enabled.status).toBe(200);
});

/** Remove the foreign-workers entitlement from Company A (platform-admin action). */
async function disableForeignWorkers(): Promise<void> {
  await prisma.companyModule.update({
    where: { companyId_moduleKey: { companyId: t.companyA, moduleKey: MODULE_KEYS.FOREIGN_WORKERS } },
    data: { enabled: false },
  });
}

describe('Integration · worker module entitlement', () => {
  it('positive control: entitled company → login + portal works', async () => {
    const token = await loginWorkerByPhone();
    const me = await request(app).get('/api/worker-portal/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
  });

  it('login is enumeration-safe once the module is disabled (200, no OTP)', async () => {
    await disableForeignWorkers();
    whatsapp.reset();
    const start = await request(app).post('/api/worker-auth/phone/start').send({ phone: PHONE });
    expect(start.status).toBe(200);
    expect(start.body).toEqual({ ok: true });
    expect(whatsapp.sent).toHaveLength(0); // identical to an unknown worker — no leak
  });

  it('a live portal session fails closed on the next request after disable', async () => {
    const token = await loginWorkerByPhone();
    expect(
      (await request(app).get('/api/worker-portal/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(200);

    await disableForeignWorkers();

    // requireWorkerModule denies — the company is no longer entitled.
    expect(
      (await request(app).get('/api/worker-portal/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
  });

  it('a live portal session is locked out when the company is disabled', async () => {
    const token = await loginWorkerByPhone();
    await prisma.company.update({ where: { id: t.companyA }, data: { isActive: false } });
    // authenticateWorker fails closed with a generic 401 for a disabled company.
    expect(
      (await request(app).get('/api/worker-portal/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(401);
  });
});
