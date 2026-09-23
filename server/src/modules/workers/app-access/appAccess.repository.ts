import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';

/**
 * Persistence for the manager-driven worker app-access lifecycle
 * (SECURITY_PRINCIPLES.md §5/§6). The ONLY layer here that touches `prisma`. All
 * ops are tenant-scoped via `updateMany({ where: { id, companyId } })`, so a
 * foreign-company worker matches zero rows and is never mutated.
 *
 * The partial-unique index `worker_phonee164_authenabled_uq` guarantees one enabled
 * worker per normalized phone; a violation surfaces as `PhoneAlreadyEnrolledError`
 * (mapped to a generic 409 by the service — no cross-tenant disclosure).
 */

/** Raised when enabling/claiming a phone already held by another enabled worker. */
export class PhoneAlreadyEnrolledError extends Error {
  constructor() {
    super('phone_already_enrolled');
    this.name = 'PhoneAlreadyEnrolledError';
  }
}

/** Current app-access status for the manager UI (no secrets). */
export interface AppAccessStatus {
  id: number;
  authEnabled: boolean;
  phone: string | null;
  hasQr: boolean;
}

export interface EnableParams {
  workerId: number;
  companyId: number;
  phoneDisplay: string;
  phoneE164: string;
  qrTokenHash: string;
  qrTokenEnc: string;
}

export interface IAppAccessRepository {
  getStatus(workerId: number, companyId: number): Promise<AppAccessStatus | null>;
  /** Returns the display phone of the worker (to reuse when the manager omits one), or null if not found. */
  getWorkerPhone(workerId: number, companyId: number): Promise<{ phone: string | null } | null>;
  enable(params: EnableParams): Promise<boolean>;
  rotateQr(
    workerId: number,
    companyId: number,
    qrTokenHash: string,
    qrTokenEnc: string,
  ): Promise<boolean>;
  disableAndBump(workerId: number, companyId: number): Promise<boolean>;
  getQrToken(
    workerId: number,
    companyId: number,
  ): Promise<{ qrTokenEnc: string | null; authEnabled: boolean } | null>;
}

/** Translate a partial-unique-index violation on the phone into the domain error. */
function rethrowPhoneConflict(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    JSON.stringify(err.meta ?? {}).includes('phonee164')
  ) {
    throw new PhoneAlreadyEnrolledError();
  }
  throw err;
}

export class AppAccessRepository implements IAppAccessRepository {
  async getStatus(workerId: number, companyId: number): Promise<AppAccessStatus | null> {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, companyId },
      select: { id: true, authEnabled: true, phone: true, qrTokenHash: true },
    });
    if (!worker) return null;
    return {
      id: worker.id,
      authEnabled: worker.authEnabled,
      phone: worker.phone,
      hasQr: worker.qrTokenHash != null,
    };
  }

  async getWorkerPhone(
    workerId: number,
    companyId: number,
  ): Promise<{ phone: string | null } | null> {
    return prisma.worker.findFirst({
      where: { id: workerId, companyId },
      select: { phone: true },
    });
  }

  async enable(params: EnableParams): Promise<boolean> {
    try {
      const result = await prisma.worker.updateMany({
        where: { id: params.workerId, companyId: params.companyId },
        data: {
          authEnabled: true,
          phone: params.phoneDisplay,
          phoneE164: params.phoneE164,
          qrTokenHash: params.qrTokenHash,
          qrTokenEnc: params.qrTokenEnc,
        },
      });
      return result.count > 0;
    } catch (err) {
      rethrowPhoneConflict(err);
    }
  }

  async rotateQr(
    workerId: number,
    companyId: number,
    qrTokenHash: string,
    qrTokenEnc: string,
  ): Promise<boolean> {
    const result = await prisma.worker.updateMany({
      where: { id: workerId, companyId },
      data: { qrTokenHash, qrTokenEnc },
    });
    return result.count > 0;
  }

  async disableAndBump(workerId: number, companyId: number): Promise<boolean> {
    // Revoke-all: flip authEnabled off, bump tokenVersion (kills live access tokens),
    // and RELEASE the phone/QR claim (clears phoneE164 so another worker may enroll it,
    // and clears the QR material so the old QR resolves to nothing).
    const result = await prisma.worker.updateMany({
      where: { id: workerId, companyId },
      data: {
        authEnabled: false,
        tokenVersion: { increment: 1 },
        phoneE164: null,
        qrTokenHash: null,
        qrTokenEnc: null,
        mfaCodeHash: null,
        mfaCodeExpiresAt: null,
        mfaCodeAttempts: 0,
      },
    });
    return result.count > 0;
  }

  async getQrToken(
    workerId: number,
    companyId: number,
  ): Promise<{ qrTokenEnc: string | null; authEnabled: boolean } | null> {
    return prisma.worker.findFirst({
      where: { id: workerId, companyId },
      select: { qrTokenEnc: true, authEnabled: true },
    });
  }
}
