import prisma from '../../lib/prisma';

/**
 * Persistence for stateful, rotating refresh tokens (SECURITY_PRINCIPLES.md §4).
 * Only this repository touches `prisma` (server/CLAUDE.md layering rule). The raw
 * token is NEVER stored — callers pass its SHA-256 hash.
 */

/** A stored refresh-token row, minus the (never-stored) raw token. */
export interface RefreshTokenRecord {
  id: string;
  userId: number;
  familyId: string;
  isRevoked: boolean;
  expiresAt: Date;
}

/** The data needed to persist a freshly minted refresh token. */
export interface NewRefreshToken {
  userId: number;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IRefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Atomically retire the current token and issue its successor (same family).
   * Returns `false` if the old row was already revoked/rotated (lost the race) —
   * the caller treats that as reuse and triggers breach mitigation.
   */
  rotate(oldId: string, next: NewRefreshToken): Promise<boolean>;
  /** Breach mitigation: revoke the whole family AND bump the user's tokenVersion (atomic). */
  revokeFamilyAndBumpUser(userId: number, familyId: string): Promise<void>;
  /** Revoke every active refresh token for a user (password change / disable / admin revoke). */
  revokeAllForUser(userId: number): Promise<void>;
  /** Best-effort single-token revoke (logout). */
  revokeByHash(tokenHash: string): Promise<void>;
}

export class RefreshTokenRepository implements IRefreshTokenRepository {
  async create(token: NewRefreshToken): Promise<void> {
    await prisma.refreshToken.create({ data: token });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      familyId: row.familyId,
      isRevoked: row.isRevoked,
      expiresAt: row.expiresAt,
    };
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      // Conditional revoke: only succeeds if the row is still active. This is the
      // race-safe single-use guard — a concurrent rotation makes count === 0.
      const marked = await tx.refreshToken.updateMany({
        where: { id: oldId, isRevoked: false },
        data: { isRevoked: true },
      });
      if (marked.count === 0) {
        return false;
      }
      await tx.refreshToken.create({ data: next });
      return true;
    });
  }

  async revokeFamilyAndBumpUser(userId: number, familyId: string): Promise<void> {
    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { familyId, isRevoked: false },
        data: { isRevoked: true },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash, isRevoked: false },
      data: { isRevoked: true },
    });
  }
}
