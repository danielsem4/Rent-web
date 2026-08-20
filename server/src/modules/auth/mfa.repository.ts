import prisma from '../../lib/prisma';

/**
 * Persistence for TOTP MFA state (SECURITY_PRINCIPLES.md §3). The ONLY layer that
 * touches `prisma` for MFA (server/CLAUDE.md). Stores the ENCRYPTED TOTP secret
 * and HASHED recovery codes — this repository handles neither crypto nor hashing
 * (the service does), it only reads/writes the columns.
 */

/** MFA material for a user. `mfaSecret` is AES-GCM ciphertext (or null). */
export interface MfaContext {
  isMfaEnabled: boolean;
  mfaSecret: string | null;
  recoveryCodeHashes: string[];
}

export interface IMfaRepository {
  getMfa(userId: number): Promise<MfaContext | null>;
  /** bcrypt password hash for step-up verification (e.g. disabling MFA). */
  getPasswordHash(userId: number): Promise<string | null>;
  /** Store a pending secret + hashed recovery codes; does NOT enable MFA yet. */
  savePendingSecret(userId: number, encryptedSecret: string, hashedRecoveryCodes: string[]): Promise<void>;
  enableMfa(userId: number): Promise<void>;
  /** Disable MFA and wipe all secret material. */
  disableMfa(userId: number): Promise<void>;
  /** Atomically consume a single-use recovery code; false if already used/absent. */
  consumeRecoveryCode(userId: number, codeHash: string): Promise<boolean>;
}

export class MfaRepository implements IMfaRepository {
  async getMfa(userId: number): Promise<MfaContext | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isMfaEnabled: true, mfaSecret: true, mfaRecoveryCodes: true },
    });
    if (!user) return null;
    return {
      isMfaEnabled: user.isMfaEnabled,
      mfaSecret: user.mfaSecret,
      recoveryCodeHashes: user.mfaRecoveryCodes,
    };
  }

  async getPasswordHash(userId: number): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    return user?.passwordHash ?? null;
  }

  async savePendingSecret(
    userId: number,
    encryptedSecret: string,
    hashedRecoveryCodes: string[],
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      // isMfaEnabled intentionally left as-is (false) — enrollment completes at verify-setup.
      data: { mfaSecret: encryptedSecret, mfaRecoveryCodes: hashedRecoveryCodes },
    });
  }

  async enableMfa(userId: number): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { isMfaEnabled: true } });
  }

  async disableMfa(userId: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { isMfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
    });
  }

  async consumeRecoveryCode(userId: number, codeHash: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { mfaRecoveryCodes: true },
      });
      if (!user || !user.mfaRecoveryCodes.includes(codeHash)) {
        return false;
      }
      const remaining = user.mfaRecoveryCodes.filter((h) => h !== codeHash);
      // The `has` guard makes removal atomic/race-safe: a concurrent consumer that
      // already removed this hash makes the WHERE match nothing (count 0 → false).
      const res = await tx.user.updateMany({
        where: { id: userId, mfaRecoveryCodes: { has: codeHash } },
        data: { mfaRecoveryCodes: { set: remaining } },
      });
      return res.count === 1;
    });
  }
}
