import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import prisma from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { Role } from '../../src/shared/constants/roles';
import {
  resetDatabase,
  seedTenants,
  loginAs,
  TEST_PASSWORD,
  MFA_TEST_SECRET,
  type SeededTenants,
} from './helpers/db';

const app = createApp();
let t: SeededTenants;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
});

/** Create an UNENROLLED privileged user (seeded managers are pre-enrolled). */
async function createUnenrolledManager(email: string): Promise<number> {
  const u = await prisma.user.create({
    data: {
      email,
      name: 'Fresh Manager',
      role: Role.COMPANY_MANAGER,
      companyId: t.companyA,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
    },
  });
  return u.id;
}

function secretFromOtpauth(url: string): string {
  return new URL(url).searchParams.get('secret') ?? '';
}

describe('Integration · MFA enrollment (hard-gated, real DB)', () => {
  it('privileged first login → enroll → verify-setup issues a session; MFA is then enabled', async () => {
    const email = 'fresh-manager@test.local';
    const userId = await createUnenrolledManager(email);

    // Step 1: credentials valid, but no session — an enroll token is returned.
    const login = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ mfaRequired: true, mfaSetupRequired: true });
    expect(login.headers['set-cookie']).toBeUndefined();
    const enrollToken = login.body.mfaToken as string;

    // Step 2: setup with the enroll token → provisioning payload (once).
    const setup = await request(app).post('/api/auth/mfa/setup').send({ mfaToken: enrollToken });
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl.startsWith('otpauth://totp/')).toBe(true);
    expect(setup.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(setup.body.recoveryCodes).toHaveLength(10);
    const secret = secretFromOtpauth(setup.body.otpauthUrl);

    // Still pending until verified.
    expect((await prisma.user.findUnique({ where: { id: userId } }))!.isMfaEnabled).toBe(false);

    // Step 3: verify-setup with a valid code → session issued + MFA enabled.
    const verify = await request(app)
      .post('/api/auth/mfa/verify-setup')
      .send({ mfaToken: enrollToken, code: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({ enabled: true });
    expect(verify.body.user.email).toBe(email);
    const cookies = verify.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toMatch(/(^|;)\s*token=/);

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser!.isMfaEnabled).toBe(true);
    expect(dbUser!.mfaSecret).toBeTruthy();
    expect(dbUser!.mfaSecret).not.toContain(secret); // stored encrypted, not plaintext
  });

  it('an enrolled recovery code logs in once, then is rejected (single-use)', async () => {
    const email = 'recovery-manager@test.local';
    await createUnenrolledManager(email);
    const login = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const enrollToken = login.body.mfaToken as string;
    const setup = await request(app).post('/api/auth/mfa/setup').send({ mfaToken: enrollToken });
    const secret = secretFromOtpauth(setup.body.otpauthUrl);
    const recoveryCode = setup.body.recoveryCodes[0] as string;
    await request(app)
      .post('/api/auth/mfa/verify-setup')
      .send({ mfaToken: enrollToken, code: authenticator.generate(secret) });

    // New login → challenge; use the RECOVERY code.
    const l2 = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const first = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: l2.body.mfaToken, code: recoveryCode });
    expect(first.status).toBe(200);
    expect(first.body.user.email).toBe(email);

    // Reusing the same recovery code fails (consumed).
    const l3 = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const reuse = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: l3.body.mfaToken, code: recoveryCode });
    expect(reuse.status).toBe(401);
  });
});

describe('Integration · MFA challenge (real DB)', () => {
  it('an enrolled user completes login with a valid TOTP code', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.mfaSetupRequired).toBeUndefined(); // already enrolled

    const challenge = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: login.body.mfaToken, code: authenticator.generate(MFA_TEST_SECRET) });
    expect(challenge.status).toBe(200);
    expect(challenge.body.user.email).toBe(t.managerA.email);
    expect((challenge.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/(^|;)\s*token=/);
  });

  it('a bad TOTP code is rejected (401) and issues no session', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    const challenge = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaToken: login.body.mfaToken, code: '000000' });
    expect(challenge.status).toBe(401);
    expect(challenge.headers['set-cookie']).toBeUndefined();
  });
});

describe('Integration · MFA enforcement & disable (real DB)', () => {
  it('a privileged user cannot obtain a session from credentials alone', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.superAdmin.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.user).toBeUndefined();
    expect(login.headers['set-cookie']).toBeUndefined();
  });

  it('a non-privileged user logs in one-step (MFA not required)', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: t.renterA.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBeUndefined();
    expect(login.body.user.email).toBe(t.renterA.email);
  });

  it('disabling MFA (step-up password) forces re-enrollment on next privileged login', async () => {
    // managerA is enrolled; get a session via the helper (completes MFA).
    const { cookie } = await loginAs(app, t.managerA.email);

    const disable = await request(app)
      .post('/api/auth/mfa/disable')
      .set('Cookie', cookie)
      .set('Origin', process.env['CLIENT_URL'] || 'http://localhost:5173')
      .send({ password: TEST_PASSWORD });
    expect(disable.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: t.managerA.id } }))!.isMfaEnabled).toBe(false);

    // Next login: privileged + unenrolled → hard-gated back into enrollment.
    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    expect(relogin.body).toMatchObject({ mfaRequired: true, mfaSetupRequired: true });
  });
});
