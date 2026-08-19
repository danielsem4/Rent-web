import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import type { AccountMailer } from '../../src/shared/notifications/mailer';
import {
  resetDatabase,
  seedTenants,
  loginAs,
  TEST_PASSWORD,
  type SeededTenants,
} from './helpers/db';

// Capture invite/reset links so the account flows can be driven end-to-end.
const delivered: Array<{ kind: 'invitation' | 'reset'; to: string; token: string }> = [];
const captureMailer: AccountMailer = {
  sendInvitation: async (to, link) => {
    delivered.push({ kind: 'invitation', to, token: tokenOf(link) });
  },
  sendPasswordReset: async (to, link) => {
    delivered.push({ kind: 'reset', to, token: tokenOf(link) });
  },
};
function tokenOf(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

// Default (real) audit logger — this suite asserts rows land in the AuditLog table.
const app = createApp(undefined, { mailer: captureMailer });
const ORIGIN = process.env['CLIENT_URL'] || 'http://localhost:5173';

let t: SeededTenants;

beforeEach(async () => {
  await resetDatabase();
  t = await seedTenants();
  delivered.length = 0;
});

async function auditRows(action: string) {
  return prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });
}

describe('Integration · audit trail (real DB)', () => {
  it('records AUTH_LOGIN_SUCCESS with the actor, tenant, and request context', async () => {
    await loginAs(app, t.managerA.email);

    const rows = await auditRows('AUTH_LOGIN_SUCCESS');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.userId).toBe(t.managerA.id);
    expect(row.companyId).toBe(t.managerA.companyId);
    expect(row.resourceType).toBe('AUTH');
    expect(row.resourceId).toBe(String(t.managerA.id));
    expect(row.ipAddress).toBeTruthy();
    // No credential material anywhere in the record.
    expect(JSON.stringify(row)).not.toContain(TEST_PASSWORD);
  });

  it('records AUTH_LOGIN_FAILED with a reason for a bad password (no password stored)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: t.managerA.email, password: 'wrong-password-1' });
    expect(res.status).toBe(401);

    const rows = await auditRows('AUTH_LOGIN_FAILED');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(t.managerA.id);
    expect((rows[0]!.metadata as { reason?: string }).reason).toBe('bad_credentials');
    expect(JSON.stringify(rows[0])).not.toContain('wrong-password-1');
  });

  it('records AUTH_LOGIN_FAILED for an unknown email with no actor id', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'whatever-123' });
    expect(res.status).toBe(401);

    const rows = await auditRows('AUTH_LOGIN_FAILED');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBeNull();
    expect((rows[0]!.metadata as { reason?: string }).reason).toBe('unknown_email');
  });

  it('records USER_CREATED + INVITATION_SENT on provisioning, and INVITATION_ACCEPTED on accept', async () => {
    const { cookie } = await loginAs(app, t.managerA.email);

    const created = await request(app)
      .post('/api/users')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ email: 'invitee@test.local', name: 'Invitee', role: 'COMPANY_WORKER' });
    expect(created.status).toBe(201);
    const newUserId: number = created.body.user.id;

    // USER_CREATED: actor is the manager; target is the new user.
    const createdRows = await auditRows('USER_CREATED');
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]!.userId).toBe(t.managerA.id);
    expect(createdRows[0]!.companyId).toBe(t.managerA.companyId);
    expect(createdRows[0]!.resourceId).toBe(String(newUserId));

    // INVITATION_SENT for the invited user.
    const sentRows = await auditRows('INVITATION_SENT');
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0]!.userId).toBe(newUserId);

    // Accept the invitation → INVITATION_ACCEPTED.
    const invite = delivered.find((d) => d.kind === 'invitation');
    const accept = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: invite!.token, password: 'brandnew123' });
    expect(accept.status).toBe(200);

    const acceptedRows = await auditRows('INVITATION_ACCEPTED');
    expect(acceptedRows).toHaveLength(1);
    expect(acceptedRows[0]!.userId).toBe(newUserId);
    expect((acceptedRows[0]!.metadata as { sessionsRevoked?: boolean }).sessionsRevoked).toBe(true);
  });

  it('records USER_ROLE_CHANGED distinctly from USER_UPDATED on a role change', async () => {
    const { cookie } = await loginAs(app, t.managerA.email);
    const res = await request(app)
      .patch(`/api/users/${t.workerA.id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ role: 'RENTER' });
    expect(res.status).toBe(200);

    expect(await auditRows('USER_UPDATED')).toHaveLength(1);
    const roleRows = await auditRows('USER_ROLE_CHANGED');
    expect(roleRows).toHaveLength(1);
    expect(roleRows[0]!.resourceId).toBe(String(t.workerA.id));
    expect((roleRows[0]!.metadata as { newRole?: string }).newRole).toBe('RENTER');
  });

  it('records PASSWORD_RESET_COMPLETED and never stores the raw reset token', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: t.managerA.email });
    const reset = delivered.find((d) => d.kind === 'reset');
    expect(reset?.token).toBeTruthy();

    const done = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: reset!.token, password: 'rotated123' });
    expect(done.status).toBe(200);

    expect(await auditRows('PASSWORD_RESET_REQUESTED')).toHaveLength(1);
    const completed = await auditRows('PASSWORD_RESET_COMPLETED');
    expect(completed).toHaveLength(1);
    expect(completed[0]!.userId).toBe(t.managerA.id);

    // The raw reset token must appear NOWHERE in the audit trail.
    const all = await prisma.auditLog.findMany();
    expect(JSON.stringify(all)).not.toContain(reset!.token);
    expect(JSON.stringify(all)).not.toContain('rotated123');
  });
});
