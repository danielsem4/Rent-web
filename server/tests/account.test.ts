import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Prisma isolation (same strategy as auth.test.ts / users.test.ts).
//
// The account module reads/writes `user` + `accountToken` and consumes tokens
// inside `prisma.$transaction`. The mock's `$transaction` invokes its callback
// with the same mocked client, so `tx.accountToken.updateMany` / `tx.user.update`
// are the same spies we assert on. No database is contacted.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(async () => ({})),
  tokenFindUnique: vi.fn(),
  tokenUpdateMany: vi.fn(async () => ({ count: 1 })),
  tokenCreate: vi.fn(async () => ({ id: 1 })),
}));

vi.mock('../src/lib/prisma', () => {
  const client = {
    user: { findUnique: h.userFindUnique, update: h.userUpdate },
    accountToken: {
      findUnique: h.tokenFindUnique,
      updateMany: h.tokenUpdateMany,
      create: h.tokenCreate,
    },
    auditLog: { create: vi.fn() },
    // Batch 5: consumeTokenAndSetPassword now also revokes refresh tokens in the tx.
    refreshToken: { updateMany: vi.fn(async () => ({ count: 0 })) },
    // Callback form: run against the same mocked client so the inner writes are spied.
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(client),
  };
  return { default: client };
});

import { createApp } from '../src/app';
import type { AccountMailer } from '../src/shared/notifications/mailer';

const sent: Array<{ kind: 'invitation' | 'reset'; to: string; link: string }> = [];
const captureMailer: AccountMailer = {
  sendInvitation: async (to, link) => {
    sent.push({ kind: 'invitation', to, link });
  },
  sendPasswordReset: async (to, link) => {
    sent.push({ kind: 'reset', to, link });
  },
};

const app = createApp(undefined, { mailer: captureMailer });

const INVALID_TOKEN = 'Invalid or expired token';
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);
const STRONG_PW = 'password123';

/** Shape returned by the mocked `accountToken.findUnique` (repo pins `type`). */
function tokenRow(type: 'INVITATION' | 'PASSWORD_RESET', over: Record<string, unknown> = {}) {
  return { id: 5, userId: 42, type, expiresAt: FUTURE, usedAt: null, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  h.tokenUpdateMany.mockResolvedValue({ count: 1 });
  h.userUpdate.mockResolvedValue({});
});

// ===========================================================================
// POST /api/auth/invitation/accept
// ===========================================================================
describe('POST /api/auth/invitation/accept', () => {
  it('sets the password, activates the account, and bumps tokenVersion (revoke-all)', async () => {
    h.tokenFindUnique.mockResolvedValue(tokenRow('INVITATION'));

    const res = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'raw-token', password: STRONG_PW });

    expect(res.status).toBe(200);
    expect(h.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({ tokenVersion: { increment: 1 }, isActive: true }),
      }),
    );
    // The stored password hash is never the plaintext.
    const call = h.userUpdate.mock.calls[0]![0] as { data: { passwordHash: string } };
    expect(call.data.passwordHash).not.toContain(STRONG_PW);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects an unknown token (400)', async () => {
    h.tokenFindUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'nope', password: STRONG_PW });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(INVALID_TOKEN);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an expired token (400)', async () => {
    h.tokenFindUnique.mockResolvedValue(tokenRow('INVITATION', { expiresAt: PAST }));
    const res = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'raw', password: STRONG_PW });
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an already-used token (400)', async () => {
    h.tokenFindUnique.mockResolvedValue(tokenRow('INVITATION', { usedAt: new Date() }));
    const res = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'raw', password: STRONG_PW });
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects a token consumed concurrently — single-use race (400)', async () => {
    h.tokenFindUnique.mockResolvedValue(tokenRow('INVITATION'));
    h.tokenUpdateMany.mockResolvedValue({ count: 0 }); // lost the race
    const res = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'raw', password: STRONG_PW });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(INVALID_TOKEN);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects a weak password before touching the DB (400)', async () => {
    h.tokenFindUnique.mockResolvedValue(tokenRow('INVITATION'));
    const short = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'raw', password: 'short' });
    expect(short.status).toBe(400);
    const noDigit = await request(app)
      .post('/api/auth/invitation/accept')
      .send({ token: 'raw', password: 'onlyletters' });
    expect(noDigit.status).toBe(400);
    expect(h.tokenFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing token (400)', async () => {
    const res = await request(app).post('/api/auth/invitation/accept').send({ password: STRONG_PW });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST /api/auth/reset-password
// ===========================================================================
describe('POST /api/auth/reset-password', () => {
  it('sets the password and bumps tokenVersion, WITHOUT changing activation', async () => {
    h.tokenFindUnique.mockResolvedValue(tokenRow('PASSWORD_RESET'));

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'raw', password: STRONG_PW });

    expect(res.status).toBe(200);
    const call = h.userUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data['tokenVersion']).toEqual({ increment: 1 });
    // reset must NOT re-activate a disabled account.
    expect(call.data).not.toHaveProperty('isActive');
  });

  it('does not accept an INVITATION token on the reset endpoint (type-pinned, 400)', async () => {
    // Repo pins type: a lookup for PASSWORD_RESET returns null for an INVITATION row.
    h.tokenFindUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invite-token', password: STRONG_PW });
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects expired/used/unknown tokens (400)', async () => {
    for (const row of [null, tokenRow('PASSWORD_RESET', { expiresAt: PAST }), tokenRow('PASSWORD_RESET', { usedAt: new Date() })]) {
      h.tokenFindUnique.mockResolvedValue(row);
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'raw', password: STRONG_PW });
      expect(res.status).toBe(400);
    }
    expect(h.userUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/auth/forgot-password — enumeration-safe
// ===========================================================================
describe('POST /api/auth/forgot-password', () => {
  it('returns an identical 200 body for an existing vs a non-existing email', async () => {
    h.userFindUnique.mockResolvedValueOnce({ id: 42, isActive: true }); // exists + active
    const existing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'real@test.dev' });

    h.userFindUnique.mockResolvedValueOnce(null); // does not exist
    const missing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@test.dev' });

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body).toEqual(missing.body); // caller cannot distinguish

    // Behind the identical response: a reset token was issued only for the real user.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.kind).toBe('reset');
    expect(sent[0]!.to).toBe('real@test.dev');
  });

  it('does not issue a reset for a disabled (pending/inactive) account', async () => {
    h.userFindUnique.mockResolvedValueOnce({ id: 42, isActive: false });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'pending@test.dev' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(h.tokenCreate).not.toHaveBeenCalled();
  });

  it('rejects a malformed email (400)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
