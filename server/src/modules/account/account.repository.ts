import prisma from '../../lib/prisma';
import { AccountTokenType } from '../../shared/constants/accountTokens';

/** Minimal account status used by the enumeration-safe forgot-password lookup. */
export interface AccountUserStatus {
  id: number;
  isActive: boolean;
}

/** A stored lifecycle token, as needed to validate/consume it. */
export interface AccountTokenRecord {
  id: number;
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface IAccountRepository {
  findUserByEmail(email: string): Promise<AccountUserStatus | null>;
  invalidateUnusedTokens(userId: number, type: AccountTokenType): Promise<void>;
  createToken(
    userId: number,
    type: AccountTokenType,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  findTokenByHash(tokenHash: string, type: AccountTokenType): Promise<AccountTokenRecord | null>;
  /**
   * Atomically spend a token and set the user's password.
   * @returns `true` if consumed, `false` if the token was already used (a
   *   concurrent request won the race) — the caller maps `false` to a 400.
   */
  consumeTokenAndSetPassword(
    tokenId: number,
    userId: number,
    passwordHash: string,
    activate: boolean,
  ): Promise<boolean>;
}

/** Sentinel used to roll back the consume transaction when the token is spent. */
class TokenAlreadyUsedError extends Error {}

export class AccountRepository implements IAccountRepository {
  async findUserByEmail(email: string): Promise<AccountUserStatus | null> {
    // Exact-match lookup, matching login semantics (no broad email normalization
    // this batch). Returns only { id, isActive } — never the passwordHash.
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    return user;
  }

  async invalidateUnusedTokens(userId: number, type: AccountTokenType): Promise<void> {
    // Only the latest issued token of a type stays valid: retire any prior unused
    // ones so a superseded invite/reset link cannot be redeemed.
    await prisma.accountToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async createToken(
    userId: number,
    type: AccountTokenType,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await prisma.accountToken.create({ data: { userId, type, tokenHash, expiresAt } });
  }

  async findTokenByHash(
    tokenHash: string,
    type: AccountTokenType,
  ): Promise<AccountTokenRecord | null> {
    const token = await prisma.accountToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
    });
    // A hash collision across types is impossible in practice, but pin the type
    // so an invitation token can never be redeemed on the reset endpoint.
    if (!token || token.type !== type) return null;
    return { id: token.id, userId: token.userId, expiresAt: token.expiresAt, usedAt: token.usedAt };
  }

  async consumeTokenAndSetPassword(
    tokenId: number,
    userId: number,
    passwordHash: string,
    activate: boolean,
  ): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        // Conditional mark makes single-use race-safe: only one concurrent request
        // flips usedAt from null; the loser sees count 0 and rolls back.
        const marked = await tx.accountToken.updateMany({
          where: { id: tokenId, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (marked.count === 0) {
          throw new TokenAlreadyUsedError();
        }
        await tx.user.update({
          where: { id: userId },
          data: {
            passwordHash,
            // Revoke-all: every previously issued session for this user is
            // invalidated on a password change (SECURITY_PRINCIPLES.md §4).
            tokenVersion: { increment: 1 },
            ...(activate ? { isActive: true } : {}),
          },
        });
      });
      return true;
    } catch (err) {
      if (err instanceof TokenAlreadyUsedError) return false;
      throw err;
    }
  }
}
