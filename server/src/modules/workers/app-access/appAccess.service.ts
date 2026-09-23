import QRCode from 'qrcode';
import { AppError } from '../../../shared/errors/AppError';
import type { CurrentUser } from '../../../shared/middlewares/authenticate';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../../shared/audit/auditLogger';
import { generateToken, hashToken } from '../../../shared/utils/token';
import { encryptField, decryptField } from '../../../shared/utils/fieldEncryption';
import { normalizeToE164 } from '../../../shared/utils/phone';
import type { IWorkerRefreshTokenRepository } from '../../worker-auth/workerRefreshToken.repository';
import {
  PhoneAlreadyEnrolledError,
  type AppAccessStatus,
  type IAppAccessRepository,
} from './appAccess.repository';
import type { EnableAppAccessDto } from './appAccess.schema';

/**
 * Manager-driven app-access lifecycle for a worker principal (SECURITY_PRINCIPLES.md
 * §3/§4/§24). Enabling issues an opaque QR token (only its hash is a lookup key; the
 * raw token is encrypted at rest so the QR can be re-rendered). Disabling revokes all
 * sessions (bump tokenVersion + revoke refresh + release the phone/QR claim). The raw
 * QR token / phone are NEVER written to logs or the audit trail.
 */
export class AppAccessService {
  constructor(
    private readonly repo: IAppAccessRepository,
    private readonly refreshRepo: IWorkerRefreshTokenRepository,
    private readonly audit: IAuditLogger,
    /** Base URL for the QR deep link (App Link / Universal Link). */
    private readonly appLinkBase: string,
  ) {}

  async getStatus(workerId: number, currentUser: CurrentUser): Promise<AppAccessStatus> {
    const status = await this.repo.getStatus(workerId, currentUser.companyId);
    if (!status) {
      throw new AppError('Worker not found', 404);
    }
    return status;
  }

  async enable(
    workerId: number,
    dto: EnableAppAccessDto,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<AppAccessStatus> {
    const worker = await this.repo.getWorkerPhone(workerId, currentUser.companyId);
    if (!worker) {
      throw new AppError('Worker not found', 404);
    }

    const rawPhone = (dto.phone ?? worker.phone ?? '').trim();
    if (!rawPhone) {
      throw new AppError('A phone number is required to enable app access', 400);
    }
    const phoneE164 = normalizeToE164(rawPhone);
    if (!phoneE164) {
      throw new AppError('A valid phone number is required', 400);
    }

    // Issue a fresh opaque QR token: hash for the login lookup, ciphertext for
    // re-rendering the QR later. The raw value never leaves this method except inside
    // the rendered QR image (GET .../qr).
    const rawToken = generateToken();
    let ok: boolean;
    try {
      ok = await this.repo.enable({
        workerId,
        companyId: currentUser.companyId,
        phoneDisplay: rawPhone,
        phoneE164,
        qrTokenHash: hashToken(rawToken),
        qrTokenEnc: encryptField(rawToken),
      });
    } catch (err) {
      if (err instanceof PhoneAlreadyEnrolledError) {
        // Generic 409 — never reveals which (possibly cross-tenant) worker holds it.
        throw new AppError('This phone number is already registered for app access', 409);
      }
      throw err;
    }
    if (!ok) {
      throw new AppError('Worker not found', 404);
    }

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_APP_ACCESS_ENABLED,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(workerId),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      // Never the phone or the token — just the fact + fields touched (§18).
      metadata: { workerId, phoneUpdated: dto.phone != null },
    });

    return this.getStatus(workerId, currentUser);
  }

  async rotateQr(
    workerId: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<AppAccessStatus> {
    const rawToken = generateToken();
    const ok = await this.repo.rotateQr(
      workerId,
      currentUser.companyId,
      hashToken(rawToken),
      encryptField(rawToken),
    );
    if (!ok) {
      throw new AppError('Worker not found', 404);
    }
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_APP_ACCESS_QR_ROTATED,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(workerId),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { workerId },
    });
    return this.getStatus(workerId, currentUser);
  }

  async disable(
    workerId: number,
    currentUser: CurrentUser,
    context: AuditContext,
  ): Promise<AppAccessStatus> {
    const ok = await this.repo.disableAndBump(workerId, currentUser.companyId);
    if (!ok) {
      throw new AppError('Worker not found', 404);
    }
    // Revoke every active worker refresh token so no session survives (the bumped
    // tokenVersion already kills live access tokens on their next request).
    await this.refreshRepo.revokeAllForWorker(workerId);

    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_APP_ACCESS_DISABLED,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(workerId),
      actor: { userId: currentUser.userId, companyId: currentUser.companyId },
      context,
      metadata: { workerId },
    });
    return this.getStatus(workerId, currentUser);
  }

  /** Render the worker's current QR as a PNG (manager-only, tenant-scoped). */
  async renderQr(workerId: number, currentUser: CurrentUser): Promise<Buffer> {
    const row = await this.repo.getQrToken(workerId, currentUser.companyId);
    if (!row) {
      throw new AppError('Worker not found', 404);
    }
    if (!row.authEnabled || !row.qrTokenEnc) {
      throw new AppError('App access is not enabled for this worker', 409);
    }
    const rawToken = decryptField(row.qrTokenEnc);
    // Domain-verified https App Link carrying ONLY the opaque token — no workerId,
    // phone, or company (a photographed QR reveals no PII and can't authenticate
    // without the WhatsApp OTP).
    const deepLink = `${this.appLinkBase.replace(/\/+$/, '')}/w/onboard?t=${encodeURIComponent(rawToken)}`;
    return QRCode.toBuffer(deepLink, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });
  }
}
