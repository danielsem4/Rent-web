import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { testMailer, resetDatabase, seedTenants, loginAs, type SeededTenants } from './helpers/db';
import type { IWhatsAppSender } from '../../src/shared/notifications/whatsapp';
import { decryptField } from '../../src/shared/utils/fieldEncryption';

/**
 * End-to-end foreign-worker authentication (SECURITY_PRINCIPLES.md §3/§4/§5/§6).
 * Drives the real HTTP stack: manager enrollment → WhatsApp OTP login (phone + QR)
 * → Bearer worker-portal → session revocation → cross-principal / tenant isolation.
 */

/** Capturing WhatsApp sender — the OTP is delivered ONLY here (DB stores its hash). */
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
// Same fixed capturing mailer as the rest of the suite, plus our WhatsApp sender.
const app = createApp(undefined, { mailer: testMailer, whatsapp });

const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';
const PHONE = '+972501112233';

let t: SeededTenants;
let managerA: string[];
let managerB: string[];
let workerAStaff: string[];
let workerId: number;

/** Manager enable helper (cookie + CSRF Origin). */
function enable(id: number, cookie: string[], body: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/workers/${id}/app-access/enable`)
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .send(body);
}

/** Run the full phone-login flow and return the issued tokens. */
async function loginWorkerByPhone(): Promise<{ accessToken: string; refreshToken: string }> {
  whatsapp.reset();
  const start = await request(app).post('/api/worker-auth/phone/start').send({ phone: PHONE });
  expect(start.status).toBe(200);
  const code = whatsapp.last()!.code;
  const verify = await request(app).post('/api/worker-auth/verify').send({ phone: PHONE, code });
  expect(verify.status).toBe(200);
  return { accessToken: verify.body.accessToken, refreshToken: verify.body.refreshToken };
}

beforeEach(async () => {
  await resetDatabase();
  whatsapp.reset();
  t = await seedTenants();
  managerA = (await loginAs(app, t.managerA.email)).cookie;
  managerB = (await loginAs(app, t.managerB.email)).cookie;
  workerAStaff = (await loginAs(app, t.workerA.email)).cookie;
  const worker = await prisma.worker.create({
    data: {
      companyId: t.companyA,
      nameHe: 'עובד',
      nameEn: 'Worker One',
      nationality: 'Thailand',
      phone: PHONE,
    },
  });
  workerId = worker.id;
});

describe('Integration · manager app-access enrollment', () => {
  it('enables access, returns status, and renders a QR PNG', async () => {
    const res = await enable(workerId, managerA);
    expect(res.status).toBe(200);
    expect(res.body.appAccess).toMatchObject({ authEnabled: true, hasQr: true, phone: PHONE });

    const qr = await request(app)
      .get(`/api/workers/${workerId}/app-access/qr`)
      .set('Cookie', managerA);
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toContain('image/png');
    expect(qr.headers['cache-control']).toBe('no-store');
  });

  it('a manager from another tenant cannot enable (404, no leak)', async () => {
    const res = await enable(workerId, managerB);
    expect(res.status).toBe(404);
  });

  it('a staff worker (COMPANY_WORKER) cannot enable (403)', async () => {
    const res = await enable(workerId, workerAStaff);
    expect(res.status).toBe(403);
  });

  it('enabling a worker with no phone requires one (400)', async () => {
    const noPhone = await prisma.worker.create({
      data: { companyId: t.companyA, nameHe: 'ללא', nameEn: 'No Phone', nationality: 'Nepal' },
    });
    const res = await enable(noPhone.id, managerA);
    expect(res.status).toBe(400);
  });
});

describe('Integration · phone + WhatsApp OTP login', () => {
  beforeEach(async () => {
    await enable(workerId, managerA);
  });

  it('completes the full phone → OTP → Bearer → /me flow', async () => {
    const { accessToken } = await loginWorkerByPhone();
    const me = await request(app)
      .get('/api/worker-portal/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.worker.id).toBe(workerId);
    // Regulated identifiers are NEVER exposed on the portal.
    expect(me.body.worker).not.toHaveProperty('passportNumber');
    expect(me.body.worker).not.toHaveProperty('insurancePolicyNumber');
  });

  it('start on an unknown phone is enumeration-safe (200, no OTP sent)', async () => {
    whatsapp.reset();
    const res = await request(app)
      .post('/api/worker-auth/phone/start')
      .send({ phone: '+972500000000' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(whatsapp.sent).toHaveLength(0);
  });

  it('a wrong OTP is rejected (401) and a consumed OTP cannot be replayed', async () => {
    whatsapp.reset();
    await request(app).post('/api/worker-auth/phone/start').send({ phone: PHONE });
    const code = whatsapp.last()!.code;
    const wrong = await request(app)
      .post('/api/worker-auth/verify')
      .send({ phone: PHONE, code: '000000' });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/worker-auth/verify').send({ phone: PHONE, code });
    expect(ok.status).toBe(200);
    const replay = await request(app).post('/api/worker-auth/verify').send({ phone: PHONE, code });
    expect(replay.status).toBe(401);
  });
});

describe('Integration · QR login', () => {
  it('logs in with the decrypted QR token', async () => {
    await enable(workerId, managerA);
    // The raw QR token is stored encrypted; decrypt it to simulate a scan.
    const row = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { qrTokenEnc: true },
    });
    const qrToken = decryptField(row!.qrTokenEnc!);

    whatsapp.reset();
    const start = await request(app).post('/api/worker-auth/qr/start').send({ qrToken });
    expect(start.status).toBe(200);
    const code = whatsapp.last()!.code;
    const verify = await request(app).post('/api/worker-auth/verify').send({ qrToken, code });
    expect(verify.status).toBe(200);
    expect(verify.body.worker.id).toBe(workerId);
  });

  it('an unknown QR token is enumeration-safe (200, no OTP)', async () => {
    whatsapp.reset();
    const res = await request(app)
      .post('/api/worker-auth/qr/start')
      .send({ qrToken: 'f'.repeat(64) });
    expect(res.status).toBe(200);
    expect(whatsapp.sent).toHaveLength(0);
  });
});

describe('Integration · principal separation & tenant isolation', () => {
  beforeEach(async () => {
    await enable(workerId, managerA);
  });

  it('a worker Bearer token is rejected on a staff route (401)', async () => {
    const { accessToken } = await loginWorkerByPhone();
    const res = await request(app)
      .get('/api/workers')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  it('a staff cookie cannot access the worker portal (401)', async () => {
    const res = await request(app).get('/api/worker-portal/me').set('Cookie', managerA);
    expect(res.status).toBe(401);
  });

  it('the worker portal requires authentication (401)', async () => {
    expect((await request(app).get('/api/worker-portal/me')).status).toBe(401);
  });

  it('a worker cannot download another worker’s document (404)', async () => {
    // A document belonging to a DIFFERENT worker in the same company.
    const other = await prisma.worker.create({
      data: { companyId: t.companyA, nameHe: 'אחר', nameEn: 'Other', nationality: 'India' },
    });
    const doc = await prisma.workerDocument.create({
      data: {
        companyId: t.companyA,
        workerId: other.id,
        docType: 'PASSPORT',
        originalName: 'p.pdf',
        storageKey: 'no-such-key',
        mimeType: 'application/pdf',
        size: 1,
        checksum: 'x',
      },
    });
    const { accessToken } = await loginWorkerByPhone();
    const res = await request(app)
      .get(`/api/worker-portal/documents/${doc.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('request creation ignores body-supplied companyId/workerId/status (mass-assignment)', async () => {
    const { accessToken } = await loginWorkerByPhone();
    const res = await request(app)
      .post('/api/worker-portal/requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'MAINTENANCE',
        message: 'Leaky tap',
        companyId: t.companyB,
        workerId: 99999,
        status: 'RESOLVED',
      });
    expect(res.status).toBe(201);
    const saved = await prisma.workerRequest.findFirst({ where: { message: 'Leaky tap' } });
    expect(saved!.companyId).toBe(t.companyA);
    expect(saved!.workerId).toBe(workerId);
    expect(saved!.status).toBe('OPEN');
  });
});

describe('Integration · session revocation', () => {
  beforeEach(async () => {
    await enable(workerId, managerA);
  });

  it('disabling access revokes live tokens and the refresh token', async () => {
    const { accessToken, refreshToken } = await loginWorkerByPhone();
    // Works before disable.
    expect(
      (await request(app).get('/api/worker-portal/me').set('Authorization', `Bearer ${accessToken}`))
        .status,
    ).toBe(200);

    const disabled = await request(app)
      .post(`/api/workers/${workerId}/app-access/disable`)
      .set('Cookie', managerA)
      .set('Origin', ORIGIN)
      .send();
    expect(disabled.status).toBe(200);

    // Access token now rejected (authEnabled false + tokenVersion bumped).
    expect(
      (await request(app).get('/api/worker-portal/me').set('Authorization', `Bearer ${accessToken}`))
        .status,
    ).toBe(401);
    // Refresh token revoked.
    expect(
      (await request(app).post('/api/worker-auth/refresh').send({ refreshToken })).status,
    ).toBe(401);
  });

  it('rotating a refresh token, then reusing the old one, is denied', async () => {
    const { refreshToken } = await loginWorkerByPhone();
    const rotated = await request(app).post('/api/worker-auth/refresh').send({ refreshToken });
    expect(rotated.status).toBe(200);
    // Replaying the original (now-rotated) token → reuse → 401.
    const reuse = await request(app).post('/api/worker-auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });
});
