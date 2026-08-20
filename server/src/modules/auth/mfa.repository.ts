import prisma from '../../lib/prisma';

/**
 * Persistence for email-OTP 2FA state (SECURITY_PRINCIPLES.md §3). The ONLY layer
 * that touches `prisma` for MFA (server/CLAUDE.md). Stores the HASHED single-use
 * code + its expiry + a wrong-attempt counter — this repository handles neither
 * hashing nor policy (the service does), it only reads/writes the columns.
 */

/** The current pending email-OTP for a user (all null/0 when none is active). */
export interface EmailOtpState {
  codeHash: string | null;
  codeExpiresAt: Date | null;
  codeAttempts: number;
}

export interface IMfaRepository {
  getEmailCode(userId: number): Promise<EmailOtpState | null>;
  /** Store a fresh code hash + expiry and RESET the attempt counter to 0. */
  saveEmailCode(userId: number, codeHash: string, expiresAt: Date): Promise<void>;
  /** Atomically bump the wrong-attempt counter; returns the new count. */
  incrementAttempts(userId: number): Promise<number>;
  /** Clear the pending code (on success, expiry, or lockout). */
  clearEmailCode(userId: number): Promise<void>;
}

export class MfaRepository implements IMfaRepository {
  async getEmailCode(userId: number): Promise<EmailOtpState | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaCodeHash: true, mfaCodeExpiresAt: true, mfaCodeAttempts: true },
    });
    if (!user) return null;
    return {
      codeHash: user.mfaCodeHash,
      codeExpiresAt: user.mfaCodeExpiresAt,
      codeAttempts: user.mfaCodeAttempts,
    };
  }

  async saveEmailCode(userId: number, codeHash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaCodeHash: codeHash, mfaCodeExpiresAt: expiresAt, mfaCodeAttempts: 0 },
    });
  }

  async incrementAttempts(userId: number): Promise<number> {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { mfaCodeAttempts: { increment: 1 } },
      select: { mfaCodeAttempts: true },
    });
    return updated.mfaCodeAttempts;
  }

  async clearEmailCode(userId: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaCodeHash: null, mfaCodeExpiresAt: null, mfaCodeAttempts: 0 },
    });
  }
}
