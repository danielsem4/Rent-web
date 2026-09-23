import prisma from '../../lib/prisma';

/**
 * Persistence for the WORKER principal's rotating refresh tokens
 * (SECURITY_PRINCIPLES.md §4). A deliberate PARALLEL of the staff
 * `RefreshTokenRepository` — the two principals stay fully isolated (separate
 * tables) rather than making one table polymorphic. The race-safe rotation +
 * reuse→revoke-family+tokenVersion-bump logic is reproduced faithfully; a shared
 * negative-test suite (tests) guards against the two copies drifting apart.
 *
 * Only this layer touches `prisma`. The raw token is NEVER stored — callers pass
 * its SHA-256 hash.
 */

export interface WorkerRefreshTokenRecord {
  id: string;
  workerId: number;
  familyId: string;
  isRevoked: boolean;
  expiresAt: Date;
}

export interface NewWorkerRefreshToken {
  workerId: number;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IWorkerRefreshTokenRepository {
  create(token: NewWorkerRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<WorkerRefreshTokenRecord | null>;
  /**
   * Atomically retire the current token and issue its successor (same family).
   * Returns `false` if the old row was already revoked/rotated (lost the race) —
   * the caller treats that as reuse and triggers breach mitigation.
   */
  rotate(oldId: string, next: NewWorkerRefreshToken): Promise<boolean>;
  /** Breach mitigation: revoke the whole family AND bump the worker's tokenVersion (atomic). */
  revokeFamilyAndBumpWorker(workerId: number, familyId: string): Promise<void>;
  /** Revoke every active refresh token for a worker (disable / rotate QR / admin revoke). */
  revokeAllForWorker(workerId: number): Promise<void>;
  /** Best-effort single-token revoke (logout). */
  revokeByHash(tokenHash: string): Promise<void>;
}

export class WorkerRefreshTokenRepository implements IWorkerRefreshTokenRepository {
  async create(token: NewWorkerRefreshToken): Promise<void> {
    await prisma.workerRefreshToken.create({ data: token });
  }

  async findByHash(tokenHash: string): Promise<WorkerRefreshTokenRecord | null> {
    const row = await prisma.workerRefreshToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return {
      id: row.id,
      workerId: row.workerId,
      familyId: row.familyId,
      isRevoked: row.isRevoked,
      expiresAt: row.expiresAt,
    };
  }

  async rotate(oldId: string, next: NewWorkerRefreshToken): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      // Conditional revoke: only succeeds if the row is still active. This is the
      // race-safe single-use guard — a concurrent rotation makes count === 0.
      const marked = await tx.workerRefreshToken.updateMany({
        where: { id: oldId, isRevoked: false },
        data: { isRevoked: true },
      });
      if (marked.count === 0) {
        return false;
      }
      await tx.workerRefreshToken.create({ data: next });
      return true;
    });
  }

  async revokeFamilyAndBumpWorker(workerId: number, familyId: string): Promise<void> {
    await prisma.$transaction([
      prisma.workerRefreshToken.updateMany({
        where: { familyId, isRevoked: false },
        data: { isRevoked: true },
      }),
      prisma.worker.update({
        where: { id: workerId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
  }

  async revokeAllForWorker(workerId: number): Promise<void> {
    await prisma.workerRefreshToken.updateMany({
      where: { workerId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    await prisma.workerRefreshToken.updateMany({
      where: { tokenHash, isRevoked: false },
      data: { isRevoked: true },
    });
  }
}
