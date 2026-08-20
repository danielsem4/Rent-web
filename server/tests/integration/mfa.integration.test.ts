import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../../src/lib/prisma';
import request from 'supertest';
import { createTestApp, resetDatabase, seedTenants, testMailer, TEST_PASSWORD, type SeededTenants } from './helpers/db';
import { OTP_MAX_ATTEMPTS } from '../../src/shared/utils/otp';

const app = createTestApp();
let t: SeededTenants;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
});

describe('Integration · email-OTP 2FA (real DB)', () => {
  it('a privileged user completes login with the emailed code → session cookies', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.mfaSetupRequired).toBeUndefined(); // no enrollment step
    expect(login.headers['set-cookie']).toBeUndefined();

    // The code was emailed (captured) and only its hash is stored in the DB.
    const code = testMailer.lastMfaCode(t.managerA.email)!;
    expect(code).toMatch(/^\d{6}$/);
    const dbUser = await prisma.user.findUnique({ where: { id: t.managerA.id } });
    expect(dbUser!.mfaCodeHash).toBeTruthy();
    expect(dbUser!.mfaCodeHash).not.toBe(code); // stored hashed, not plaintext

    const challenge = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: login.body.mfaToken, code });
    expect(challenge.status).toBe(200);
    expect(challenge.body.user.email).toBe(t.managerA.email);
    expect((challenge.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/(^|;)\s*token=/);

    // Code consumed after a successful challenge.
    expect((await prisma.user.findUnique({ where: { id: t.managerA.id } }))!.mfaCodeHash).toBeNull();
  });

  it('a wrong code is rejected (401) and issues no session', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    const challenge = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: login.body.mfaToken, code: '000000' });
    expect(challenge.status).toBe(401);
    expect(challenge.headers['set-cookie']).toBeUndefined();
  });

  it('too many wrong attempts invalidate the code (even the correct code then fails)', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    const code = testMailer.lastMfaCode(t.managerA.email)!;

    // Exhaust the attempt budget with wrong codes.
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const r = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ mfaToken: login.body.mfaToken, code: '000000' });
      expect(r.status).toBe(401);
    }
    // The real code is now refused (code was burned on lockout).
    const after = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: login.body.mfaToken, code });
    expect(after.status).toBe(401);
    expect((await prisma.user.findUnique({ where: { id: t.managerA.id } }))!.mfaCodeHash).toBeNull();
  });

  it('resend issues a new code + token; the previous code stops working', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    const firstCode = testMailer.lastMfaCode(t.managerA.email)!;

    const resend = await request(app)
      .post('/api/auth/mfa/resend')
      .send({ mfaToken: login.body.mfaToken });
    expect(resend.status).toBe(200);
    expect(typeof resend.body.mfaToken).toBe('string');

    const newCode = testMailer.lastMfaCode(t.managerA.email)!;
    expect(newCode).not.toBe(firstCode);

    // Old code no longer valid; new code completes login with the new token.
    const stale = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: resend.body.mfaToken, code: firstCode });
    expect(stale.status).toBe(401);

    const ok = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: resend.body.mfaToken, code: newCode });
    expect(ok.status).toBe(200);
  });
});

describe('Integration · 2FA enforcement (real DB)', () => {
  it('a privileged (SUPER_ADMIN) user cannot obtain a session from credentials alone', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.superAdmin.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.user).toBeUndefined();
    expect(login.headers['set-cookie']).toBeUndefined();
  });

  it('a non-privileged user logs in one-step (no 2FA, no code emailed)', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.renterA.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBeUndefined();
    expect(login.body.user.email).toBe(t.renterA.email);
    expect(testMailer.lastMfaCode(t.renterA.email)).toBeUndefined();
  });
});
