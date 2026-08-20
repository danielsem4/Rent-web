import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  resetDatabase,
  seedTenants,
  loginAs,
  createTestApp,
  testMailer,
  TEST_PASSWORD,
  type SeededTenants,
} from './helpers/db';

// The raw single-use token is only ever delivered via the mailer (never stored —
// the DB holds just its hash), so the shared capturing mailer records it here to
// complete the flow end-to-end against the real database.
const delivered = testMailer.delivered;

const app = createTestApp();
// Authenticated mutations must carry the allowed Origin (CSRF runs before authorize).
const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';

let t: SeededTenants;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  delivered.length = 0;
});

describe('Integration · invitation lifecycle (real DB)', () => {
  it('invites a pending user who cannot log in until they accept and set a password', async () => {
    const { cookie } = await loginAs(app, t.managerA.email);

    // Manager invites — no password in the body.
    const created = await request(app)
      .post('/api/users')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ email: 'invitee@test.local', name: 'Invitee', role: 'COMPANY_WORKER' });
    expect(created.status).toBe(201);

    // Pending account: login is denied (generic 401) before acceptance.
    const preLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invitee@test.local', password: 'anything123' });
    expect(preLogin.status).toBe(401);

    // An invitation token was delivered.
    const invite = delivered.find((d) => d.kind === 'invitation' && d.to === 'invitee@test.local');
    expect(invite?.token).toBeTruthy();

    // Accept the invitation → set the first password.
    const accept = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: invite!.token, password: 'brandnew123' });
    expect(accept.status).toBe(200);

    // Now the account is active and the chosen password works.
    const postLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invitee@test.local', password: 'brandnew123' });
    expect(postLogin.status).toBe(200);
    expect(postLogin.body.user.email).toBe('invitee@test.local');

    // The invitation token is single-use: replay is rejected.
    const replay = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: invite!.token, password: 'another123' });
    expect(replay.status).toBe(400);
  });
});

describe('Integration · forgot/reset password (real DB)', () => {
  it('reset invalidates all prior sessions (tokenVersion) and swaps the password', async () => {
    // Establish an active session with the CURRENT password.
    const { cookie } = await loginAs(app, t.managerA.email);
    const before = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(before.status).toBe(200);

    // Request a reset (enumeration-safe 200) and capture the token.
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: t.managerA.email });
    expect(forgot.status).toBe(200);
    const reset = delivered.find((d) => d.kind === 'reset' && d.to === t.managerA.email);
    expect(reset?.token).toBeTruthy();

    // Perform the reset.
    const done = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: reset!.token, password: 'rotated123' });
    expect(done.status).toBe(200);

    // Revoke-all: the pre-reset session is rejected on its next request.
    const after = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).toBe(401);

    // Old password no longer works; the new one does.
    const oldPw = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: TEST_PASSWORD });
    expect(oldPw.status).toBe(401);

    const newPw = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: 'rotated123' });
    expect(newPw.status).toBe(200);
  });

  it('forgot-password is enumeration-safe: identical 200 for unknown emails, no token issued', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    expect(delivered).toHaveLength(0);
  });

  it('rejects a reset token after it has been used (single-use, 400)', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: t.workerA.email });
    const reset = delivered.find((d) => d.kind === 'reset');
    expect(reset?.token).toBeTruthy();

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: reset!.token, password: 'firstuse123' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: reset!.token, password: 'seconduse123' });
    expect(second.status).toBe(400);
  });
});
