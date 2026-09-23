import { describe, it, expect, beforeEach } from 'vitest';
import { WorkerAuthService } from '../src/modules/worker-auth/workerAuth.service';
import type {
  IWorkerAuthRepository,
  WorkerAuthState,
  WorkerLoginTarget,
  WorkerOtpState,
} from '../src/modules/worker-auth/workerAuth.repository';
import type {
  IWorkerRefreshTokenRepository,
  NewWorkerRefreshToken,
  WorkerRefreshTokenRecord,
} from '../src/modules/worker-auth/workerRefreshToken.repository';
import type { IWhatsAppSender } from '../src/shared/notifications/whatsapp';
import type { IAuditLogger } from '../src/shared/audit/auditLogger';
import { hashToken } from '../src/shared/utils/token';
import { OTP_MAX_ATTEMPTS } from '../src/shared/utils/otp';

/**
 * Fast unit tests for the foreign-worker login core (SECURITY_PRINCIPLES.md §3/§4).
 * Uses in-memory fakes (no DB, no HTTP) to exercise the security-critical paths:
 * enumeration-safety, single-use / attempt-capped / expiring OTP, and refresh
 * reuse → revoke-all.
 */

interface WorkerRow extends WorkerLoginTarget {
  mfaCodeHash: string | null;
  mfaCodeExpiresAt: Date | null;
  mfaCodeAttempts: number;
}

class FakeAuthRepo implements IWorkerAuthRepository {
  workers = new Map<number, WorkerRow>();
  byQrHash = new Map<string, number>();
  byPhone = new Map<string, number>();

  add(row: WorkerRow, qrHash?: string): void {
    this.workers.set(row.id, row);
    if (qrHash) this.byQrHash.set(qrHash, row.id);
    if (row.phoneE164 && row.authEnabled) this.byPhone.set(row.phoneE164, row.id);
  }

  async findAuthState(workerId: number): Promise<WorkerAuthState | null> {
    const w = this.workers.get(workerId);
    return w
      ? { id: w.id, companyId: w.companyId, authEnabled: w.authEnabled, tokenVersion: w.tokenVersion }
      : null;
  }
  async findLoginByQrTokenHash(qrTokenHash: string): Promise<WorkerLoginTarget | null> {
    const id = this.byQrHash.get(qrTokenHash);
    return id != null ? this.toTarget(id) : null;
  }
  async findEnabledLoginByPhoneE164(phoneE164: string): Promise<WorkerLoginTarget | null> {
    const id = this.byPhone.get(phoneE164);
    return id != null ? this.toTarget(id) : null;
  }
  async saveOtp(workerId: number, codeHash: string, expiresAt: Date): Promise<void> {
    const w = this.workers.get(workerId)!;
    w.mfaCodeHash = codeHash;
    w.mfaCodeExpiresAt = expiresAt;
    w.mfaCodeAttempts = 0;
  }
  async getOtp(workerId: number): Promise<WorkerOtpState | null> {
    const w = this.workers.get(workerId);
    return w
      ? { codeHash: w.mfaCodeHash, codeExpiresAt: w.mfaCodeExpiresAt, codeAttempts: w.mfaCodeAttempts }
      : null;
  }
  async incrementOtpAttempts(workerId: number): Promise<number> {
    const w = this.workers.get(workerId)!;
    w.mfaCodeAttempts += 1;
    return w.mfaCodeAttempts;
  }
  async clearOtp(workerId: number): Promise<void> {
    const w = this.workers.get(workerId)!;
    w.mfaCodeHash = null;
    w.mfaCodeExpiresAt = null;
    w.mfaCodeAttempts = 0;
  }
  async touchLastLogin(): Promise<void> {}

  private toTarget(id: number): WorkerLoginTarget {
    const w = this.workers.get(id)!;
    return {
      id: w.id,
      companyId: w.companyId,
      tokenVersion: w.tokenVersion,
      authEnabled: w.authEnabled,
      phoneE164: w.phoneE164,
    };
  }
}

class FakeRefreshRepo implements IWorkerRefreshTokenRepository {
  rows = new Map<string, WorkerRefreshTokenRecord & { tokenHash: string }>();
  authRepo: FakeAuthRepo;
  revokedFamilies: string[] = [];
  constructor(authRepo: FakeAuthRepo) {
    this.authRepo = authRepo;
  }
  async create(token: NewWorkerRefreshToken): Promise<void> {
    this.rows.set(token.tokenHash, {
      id: token.tokenHash,
      tokenHash: token.tokenHash,
      workerId: token.workerId,
      familyId: token.familyId,
      isRevoked: false,
      expiresAt: token.expiresAt,
    });
  }
  async findByHash(tokenHash: string): Promise<WorkerRefreshTokenRecord | null> {
    return this.rows.get(tokenHash) ?? null;
  }
  async rotate(oldId: string, next: NewWorkerRefreshToken): Promise<boolean> {
    const row = [...this.rows.values()].find((r) => r.id === oldId);
    if (!row || row.isRevoked) return false;
    row.isRevoked = true;
    await this.create(next);
    return true;
  }
  async revokeFamilyAndBumpWorker(workerId: number, familyId: string): Promise<void> {
    this.revokedFamilies.push(familyId);
    for (const r of this.rows.values()) if (r.familyId === familyId) r.isRevoked = true;
    const w = this.authRepo.workers.get(workerId);
    if (w) w.tokenVersion += 1;
  }
  async revokeAllForWorker(workerId: number): Promise<void> {
    for (const r of this.rows.values()) if (r.workerId === workerId) r.isRevoked = true;
  }
  async revokeByHash(tokenHash: string): Promise<void> {
    const r = this.rows.get(tokenHash);
    if (r) r.isRevoked = true;
  }
}

class CapturingWhatsApp implements IWhatsAppSender {
  sent: Array<{ phone: string; code: string }> = [];
  async sendOtp(toPhoneE164: string, code: string): Promise<void> {
    this.sent.push({ phone: toPhoneE164, code });
  }
  last(): { phone: string; code: string } | undefined {
    return this.sent[this.sent.length - 1];
  }
}

const noopAudit: IAuditLogger = { log: async () => {} };
const ctx = {};

function makeService() {
  const auth = new FakeAuthRepo();
  const refresh = new FakeRefreshRepo(auth);
  const wa = new CapturingWhatsApp();
  const service = new WorkerAuthService(auth, refresh, wa, noopAudit);
  return { auth, refresh, wa, service };
}

const PHONE = '+972501112233';

describe('WorkerAuthService — phone login', () => {
  let s: ReturnType<typeof makeService>;
  beforeEach(() => {
    s = makeService();
    s.auth.add({
      id: 1,
      companyId: 10,
      tokenVersion: 0,
      authEnabled: true,
      phoneE164: PHONE,
      mfaCodeHash: null,
      mfaCodeExpiresAt: null,
      mfaCodeAttempts: 0,
    });
  });

  it('start on a known enabled phone sends exactly one OTP', async () => {
    await s.service.startWithPhone(PHONE, ctx);
    expect(s.wa.sent).toHaveLength(1);
    expect(s.wa.last()!.phone).toBe(PHONE);
  });

  it('start on an unknown phone is enumeration-safe: no OTP sent, no throw', async () => {
    await s.service.startWithPhone('+972500000000', ctx);
    expect(s.wa.sent).toHaveLength(0);
  });

  it('start on a disabled worker sends nothing', async () => {
    s.auth.workers.get(1)!.authEnabled = false;
    s.auth.byPhone.clear();
    await s.service.startWithPhone(PHONE, ctx);
    expect(s.wa.sent).toHaveLength(0);
  });

  it('verify with the correct OTP issues a session', async () => {
    await s.service.startWithPhone(PHONE, ctx);
    const { code } = s.wa.last()!;
    const result = await s.service.verify({ phone: PHONE }, code, ctx);
    expect(result.worker).toEqual({ id: 1, companyId: 10 });
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
  });

  it('verify with a wrong OTP fails and burns the code after the attempt cap', async () => {
    await s.service.startWithPhone(PHONE, ctx);
    const { code } = s.wa.last()!;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(s.service.verify({ phone: PHONE }, '000000', ctx)).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    // Cap reached — the code is burned, so even the CORRECT code now fails.
    await expect(s.service.verify({ phone: PHONE }, code, ctx)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('a consumed OTP cannot be replayed', async () => {
    await s.service.startWithPhone(PHONE, ctx);
    const { code } = s.wa.last()!;
    await s.service.verify({ phone: PHONE }, code, ctx);
    await expect(s.service.verify({ phone: PHONE }, code, ctx)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('an expired OTP is rejected', async () => {
    await s.service.startWithPhone(PHONE, ctx);
    const { code } = s.wa.last()!;
    s.auth.workers.get(1)!.mfaCodeExpiresAt = new Date(Date.now() - 1000);
    await expect(s.service.verify({ phone: PHONE }, code, ctx)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('WorkerAuthService — QR login', () => {
  it('verify via the QR token issues a session', async () => {
    const s = makeService();
    const rawQr = 'a'.repeat(64);
    s.auth.add(
      {
        id: 2,
        companyId: 20,
        tokenVersion: 0,
        authEnabled: true,
        phoneE164: PHONE,
        mfaCodeHash: null,
        mfaCodeExpiresAt: null,
        mfaCodeAttempts: 0,
      },
      hashToken(rawQr),
    );
    await s.service.startWithQr(rawQr, ctx);
    expect(s.wa.sent).toHaveLength(1);
    const result = await s.service.verify({ qrToken: rawQr }, s.wa.last()!.code, ctx);
    expect(result.worker.id).toBe(2);
  });

  it('an unknown QR token is enumeration-safe: no OTP', async () => {
    const s = makeService();
    await s.service.startWithQr('b'.repeat(64), ctx);
    expect(s.wa.sent).toHaveLength(0);
  });
});

describe('WorkerAuthService — refresh rotation & reuse', () => {
  function seed() {
    const s = makeService();
    s.auth.add({
      id: 3,
      companyId: 30,
      tokenVersion: 0,
      authEnabled: true,
      phoneE164: PHONE,
      mfaCodeHash: null,
      mfaCodeExpiresAt: null,
      mfaCodeAttempts: 0,
    });
    return s;
  }

  it('rotates a valid refresh token', async () => {
    const s = seed();
    await s.service.startWithPhone(PHONE, ctx);
    const login = await s.service.verify({ phone: PHONE }, s.wa.last()!.code, ctx);
    const rotated = await s.service.refresh(login.tokens.refreshToken, ctx);
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(login.tokens.refreshToken);
  });

  it('reusing a rotated refresh token revokes the family and bumps tokenVersion', async () => {
    const s = seed();
    await s.service.startWithPhone(PHONE, ctx);
    const login = await s.service.verify({ phone: PHONE }, s.wa.last()!.code, ctx);
    const old = login.tokens.refreshToken;
    await s.service.refresh(old, ctx); // rotate once

    // Replaying the OLD (now revoked) token is reuse → 401 + revoke-all.
    await expect(s.service.refresh(old, ctx)).rejects.toMatchObject({ statusCode: 401 });
    expect(s.refresh.revokedFamilies.length).toBeGreaterThan(0);
    expect(s.auth.workers.get(3)!.tokenVersion).toBe(1);
  });

  it('an unknown refresh token is denied', async () => {
    const s = seed();
    await expect(s.service.refresh('deadbeef', ctx)).rejects.toMatchObject({ statusCode: 401 });
  });
});
