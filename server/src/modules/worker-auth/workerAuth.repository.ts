import prisma from '../../lib/prisma';

/**
 * Persistence for the foreign-worker login principal (SECURITY_PRINCIPLES.md §3/§4).
 * The ONLY layer here that touches `prisma` (server/CLAUDE.md layering). Mirrors the
 * staff `AuthRepository` but for the `Worker` table's auth columns. Raw QR tokens /
 * OTP codes are NEVER stored — callers pass only their SHA-256 hash.
 */

/** Fresh server-side security state for a worker request (loaded by authenticateWorker). */
export interface WorkerAuthState {
  id: number;
  companyId: number;
  authEnabled: boolean;
  tokenVersion: number;
}

/** Login target resolved during qr/phone identification and re-loaded on verify. */
export interface WorkerLoginTarget {
  id: number;
  companyId: number;
  tokenVersion: number;
  authEnabled: boolean;
  phoneE164: string | null;
}

/** Stored OTP state for the constant-time verify + expiry/attempt checks. */
export interface WorkerOtpState {
  codeHash: string | null;
  codeExpiresAt: Date | null;
  codeAttempts: number;
}

export interface IWorkerAuthRepository {
  findAuthState(workerId: number): Promise<WorkerAuthState | null>;
  findLoginByQrTokenHash(qrTokenHash: string): Promise<WorkerLoginTarget | null>;
  findEnabledLoginByPhoneE164(phoneE164: string): Promise<WorkerLoginTarget | null>;
  saveOtp(workerId: number, codeHash: string, expiresAt: Date): Promise<void>;
  getOtp(workerId: number): Promise<WorkerOtpState | null>;
  incrementOtpAttempts(workerId: number): Promise<number>;
  clearOtp(workerId: number): Promise<void>;
  touchLastLogin(workerId: number): Promise<void>;
}

const LOGIN_SELECT = {
  id: true,
  companyId: true,
  tokenVersion: true,
  authEnabled: true,
  phoneE164: true,
} as const;

export class WorkerAuthRepository implements IWorkerAuthRepository {
  async findAuthState(workerId: number): Promise<WorkerAuthState | null> {
    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { id: true, companyId: true, authEnabled: true, tokenVersion: true },
    });
    return worker;
  }

  async findLoginByQrTokenHash(qrTokenHash: string): Promise<WorkerLoginTarget | null> {
    // The qrTokenHash column is unique; a rotated/unknown token misses (null).
    const worker = await prisma.worker.findUnique({
      where: { qrTokenHash },
      select: LOGIN_SELECT,
    });
    return worker;
  }

  async findEnabledLoginByPhoneE164(phoneE164: string): Promise<WorkerLoginTarget | null> {
    // The partial-unique index (WHERE authEnabled) guarantees at most one enabled
    // match, but we defensively use findMany + length check: any non-unique result
    // (e.g. legacy data) is treated as NO match (fail closed) rather than fanning
    // an OTP to an ambiguous set.
    const matches = await prisma.worker.findMany({
      where: { phoneE164, authEnabled: true },
      select: LOGIN_SELECT,
      take: 2,
    });
    return matches.length === 1 ? matches[0]! : null;
  }

  async saveOtp(workerId: number, codeHash: string, expiresAt: Date): Promise<void> {
    // Resets the attempt counter — a freshly issued code starts at 0 wrong tries.
    await prisma.worker.update({
      where: { id: workerId },
      data: { mfaCodeHash: codeHash, mfaCodeExpiresAt: expiresAt, mfaCodeAttempts: 0 },
    });
  }

  async getOtp(workerId: number): Promise<WorkerOtpState | null> {
    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { mfaCodeHash: true, mfaCodeExpiresAt: true, mfaCodeAttempts: true },
    });
    if (!worker) return null;
    return {
      codeHash: worker.mfaCodeHash,
      codeExpiresAt: worker.mfaCodeExpiresAt,
      codeAttempts: worker.mfaCodeAttempts,
    };
  }

  async incrementOtpAttempts(workerId: number): Promise<number> {
    const worker = await prisma.worker.update({
      where: { id: workerId },
      data: { mfaCodeAttempts: { increment: 1 } },
      select: { mfaCodeAttempts: true },
    });
    return worker.mfaCodeAttempts;
  }

  async clearOtp(workerId: number): Promise<void> {
    await prisma.worker.update({
      where: { id: workerId },
      data: { mfaCodeHash: null, mfaCodeExpiresAt: null, mfaCodeAttempts: 0 },
    });
  }

  async touchLastLogin(workerId: number): Promise<void> {
    await prisma.worker.update({
      where: { id: workerId },
      data: { lastLoginAt: new Date() },
    });
  }
}
