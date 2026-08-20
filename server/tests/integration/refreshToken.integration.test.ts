import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import type { AccountMailer } from '../../src/shared/notifications/mailer';
import { hashToken } from '../../src/shared/utils/token';
import { REFRESH_COOKIE_NAME } from '../../src/shared/utils/cookie';
import { resetDatabase, seedTenants, loginAs, type SeededTenants } from './helpers/db';

// Capturing mailer so the password-reset flow can be driven end-to-end (the raw
// reset token is delivered only via the mailer — the DB stores just its hash).
const delivered: Array<{ kind: 'invitation' | 'reset'; token: string }> = [];
const captureMailer: AccountMailer = {
  sendInvitation: async (_to, link) => { delivered.push({ kind: 'invitation', token: tokenOf(link) }); },
  sendPasswordReset: async (_to, link) => { delivered.push({ kind: 'reset', token: tokenOf(link) }); },
};
function tokenOf(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

const app = createApp(undefined, { mailer: captureMailer });
const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';

let t: SeededTenants;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  delivered.length = 0;
});

/**
 * Log in and return the session Set-Cookie array (access `token` + `refreshToken`).
 * Delegates to the shared helper, which completes mandatory MFA for privileged
 * users (managerA is a COMPANY_MANAGER).
 */
async function login(email: string): Promise<string[]> {
  const { cookie } = await loginAs(app, email);
  return cookie;
}

function pick(cookies: string[], name: string): string | undefined {
  const c = cookies.find((x) => x.startsWith(`${name}=`));
  return c ? c.split(';')[0] : undefined; // "name=value"
}

describe('Integration · refresh-token rotation (real DB)', () => {
  it('login issues a stored refresh token (hash only) and a refresh cookie', async () => {
    const cookies = await login(t.managerA.email);
    expect(pick(cookies, 'token')).toBeTruthy();
    const refresh = pick(cookies, REFRESH_COOKIE_NAME);
    expect(refresh).toBeTruthy();

    const rows = await prisma.refreshToken.findMany({ where: { userId: t.managerA.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isRevoked).toBe(false);
    // Raw token is NEVER stored — only its SHA-256 hash.
    const rawValue = refresh!.split('=')[1]!;
    expect(rows[0]!.tokenHash).toBe(hashToken(rawValue));
    expect(rows[0]!.tokenHash).not.toBe(rawValue);
  });

  it('standard rotation: refresh returns new cookies and the old refresh token is retired', async () => {
    const cookies = await login(t.managerA.email);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies)
      .set('Origin', ORIGIN);
    expect(refreshed.status).toBe(200);

    const newCookies = refreshed.headers['set-cookie'] as unknown as string[];
    const newRefresh = pick(newCookies, REFRESH_COOKIE_NAME);
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(pick(cookies, REFRESH_COOKIE_NAME));

    // Two rows now exist for the family: the old (revoked) and the new (active).
    const rows = await prisma.refreshToken.findMany({ where: { userId: t.managerA.id }, orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isRevoked)).toHaveLength(1);
    expect(rows.filter((r) => !r.isRevoked)).toHaveLength(1);
    expect(rows[0]!.familyId).toBe(rows[1]!.familyId); // same lineage
  });

  it('reuse detection: replaying a rotated-away refresh token kills the whole family', async () => {
    const cookies = await login(t.managerA.email);

    // First rotation succeeds; `cookies` now holds a rotated-AWAY (revoked) refresh token.
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookies).set('Origin', ORIGIN);
    expect(first.status).toBe(200);
    const rotatedCookies = first.headers['set-cookie'] as unknown as string[];

    // Replaying the OLD refresh cookie is reuse → 401 + breach mitigation.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookies).set('Origin', ORIGIN);
    expect(replay.status).toBe(401);

    // Whole family is now revoked...
    const rows = await prisma.refreshToken.findMany({ where: { userId: t.managerA.id } });
    expect(rows.every((r) => r.isRevoked)).toBe(true);

    // ...so even the LEGITIMATE rotated token (from `first`) can no longer refresh.
    const afterBreach = await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookies).set('Origin', ORIGIN);
    expect(afterBreach.status).toBe(401);

    // ...and tokenVersion was bumped (revoke-all): the access token from `first` is dead too.
    const me = await request(app).get('/api/auth/me').set('Cookie', rotatedCookies);
    expect(me.status).toBe(401);
    const user = await prisma.user.findUnique({ where: { id: t.managerA.id } });
    expect(user!.tokenVersion).toBeGreaterThan(0);

    // A SESSION_REVOKED audit event recorded the breach.
    const breaches = await prisma.auditLog.findMany({ where: { action: 'SESSION_REVOKED' } });
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    expect((breaches[0]!.metadata as { reason?: string }).reason).toBe('refresh_reuse_detected');
  });

  it('an expired refresh token is rejected (401) and triggers mitigation', async () => {
    // Insert a refresh token directly with a past expiry (we control the raw value).
    const raw = 'expired-raw-token-value-000000000000000000000000000000000000';
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(raw),
        userId: t.managerA.id,
        familyId: 'expired-family',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${raw}`])
      .set('Origin', ORIGIN);
    expect(res.status).toBe(401);

    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    expect(row!.isRevoked).toBe(true); // family revoked
  });

  it('a disabled account cannot refresh (401)', async () => {
    const cookies = await login(t.workerA.email);
    await prisma.user.update({ where: { id: t.workerA.id }, data: { isActive: false } });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookies).set('Origin', ORIGIN);
    expect(res.status).toBe(401);
  });

  it('a password reset revokes all of the user’s refresh tokens', async () => {
    const cookies = await login(t.managerA.email);
    // Sanity: the login-minted refresh token is active.
    const before = await prisma.refreshToken.findMany({ where: { userId: t.managerA.id } });
    expect(before).toHaveLength(1);
    expect(before[0]!.isRevoked).toBe(false);

    // Drive the real reset flow and capture the delivered raw token.
    await request(app).post('/api/auth/forgot-password').send({ email: t.managerA.email });
    const reset = delivered.find((d) => d.kind === 'reset');
    expect(reset?.token).toBeTruthy();
    const done = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: reset!.token, password: 'rotated123' });
    expect(done.status).toBe(200);

    // The refresh token minted at login is now revoked (atomic with the tokenVersion bump).
    const after = await prisma.refreshToken.findMany({ where: { userId: t.managerA.id } });
    expect(after.every((r) => r.isRevoked)).toBe(true);

    // And the old refresh cookie can no longer rotate.
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookies).set('Origin', ORIGIN);
    expect(res.status).toBe(401);
  });
});
