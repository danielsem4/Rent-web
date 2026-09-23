import { randomUUID } from 'crypto';
import { AppError } from '../../shared/errors/AppError';
import { REFRESH_TOKEN_TTL_MS } from '../../shared/config/jwt';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import { generateToken, hashToken } from '../../shared/utils/token';
import {
  generateNumericOtp,
  hashOtp,
  verifyOtp,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
} from '../../shared/utils/otp';
import { signWorkerAccessToken } from '../../shared/utils/workerAccessToken';
import { normalizeToE164 } from '../../shared/utils/phone';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { IWhatsAppSender } from '../../shared/notifications/whatsapp';
import type { IWorkerAuthRepository, WorkerLoginTarget } from './workerAuth.repository';
import type { IWorkerRefreshTokenRepository } from './workerRefreshToken.repository';

/** A minted worker session: a short-lived access JWT + a raw (un-hashed) refresh token. */
export interface WorkerSessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Result of a successful verify — Bearer tokens + minimal identity for the app. */
export interface WorkerSessionResult {
  worker: { id: number; companyId: number };
  tokens: WorkerSessionTokens;
}

/** The login identifier the client re-supplies (exactly one form). */
export type LoginIdentifier = { qrToken: string } | { phone: string };

/**
 * Foreign-worker login (SECURITY_PRINCIPLES.md §3/§4). A PARALLEL of the staff
 * AuthService for the worker mobile principal — it reuses the same hardened
 * primitives (CSPRNG OTP, constant-time verify, single-use/expiry/attempt-cap,
 * rotating hashed refresh, tokenVersion revoke-all) but never touches staff auth.
 *
 * Both login methods converge on a WhatsApp OTP:
 *   - QR:    scan → identifies the worker by an opaque token → OTP sent.
 *   - Phone: type → identifies the (single) app-enabled worker by E.164 → OTP sent.
 * The client re-supplies the same identifier on verify, so there is no server-side
 * challenge to leak and all start/verify responses are generic (enumeration-safe).
 */
export class WorkerAuthService {
  constructor(
    private readonly repo: IWorkerAuthRepository,
    private readonly refreshRepo: IWorkerRefreshTokenRepository,
    private readonly whatsapp: IWhatsAppSender,
    private readonly audit: IAuditLogger,
  ) {}

  /**
   * Start login via a scanned QR token. Enumeration-safe: on any miss (unknown /
   * rotated token, disabled worker, missing phone) it returns silently WITHOUT
   * sending an OTP — the controller responds with the same generic body regardless.
   */
  async startWithQr(qrToken: string, context: AuditContext): Promise<void> {
    const target = await this.repo.findLoginByQrTokenHash(hashToken(qrToken));
    await this.startForTarget(target, 'qr', context);
  }

  /**
   * Start login via a typed phone number. Normalized to E.164 and resolved to the
   * single app-enabled worker (the partial-unique index guarantees uniqueness; a
   * non-unique/unparseable/absent result is treated as no match — fail closed).
   */
  async startWithPhone(phone: string, context: AuditContext): Promise<void> {
    const e164 = normalizeToE164(phone);
    const target = e164 ? await this.repo.findEnabledLoginByPhoneE164(e164) : null;
    await this.startForTarget(target, 'phone', context);
  }

  /** Shared start path: issue+send an OTP only for a valid, enabled, phone-bearing target. */
  private async startForTarget(
    target: WorkerLoginTarget | null,
    method: 'qr' | 'phone',
    context: AuditContext,
  ): Promise<void> {
    if (!target || !target.authEnabled || !target.phoneE164) {
      // No OTP, no disclosure. (Nothing auditable that could confirm existence.)
      return;
    }
    await this.issueOtp(target.id, target.phoneE164);
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_AUTH_CHALLENGE_ISSUED,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(target.id),
      actor: { userId: undefined, companyId: target.companyId },
      context,
      // channel/method only — never the phone or the code (§18).
      metadata: { channel: 'whatsapp', method },
    });
  }

  /** Generate a fresh OTP, persist its hash + expiry, and send it over WhatsApp. */
  private async issueOtp(workerId: number, phoneE164: string): Promise<void> {
    const code = generateNumericOtp();
    await this.repo.saveOtp(workerId, hashOtp(code), new Date(Date.now() + OTP_TTL_MS));
    // Delivery is a WhatsApp-sender concern; the console sender prints it in dev and
    // fails closed in prod. The plaintext code is never persisted or logged here.
    await this.whatsapp.sendOtp(phoneE164, code);
  }

  /**
   * Complete login: re-resolve the worker from the re-supplied identifier, verify
   * the WhatsApp OTP (constant-time, expiry + attempt checks), and only then mint a
   * Bearer session. The code is single-use — cleared on success, on expiry, and once
   * the attempt cap is hit. Every failure is audited and returns the same generic 401.
   */
  async verify(
    identifier: LoginIdentifier,
    code: string,
    context: AuditContext,
  ): Promise<WorkerSessionResult> {
    const target = await this.resolveTarget(identifier);
    if (!target || !target.authEnabled) {
      await this.auditLoginFailure(target?.id, target?.companyId, context, 'no_such_enabled_worker');
      throw new AppError('Invalid or expired code', 401);
    }

    const otp = await this.repo.getOtp(target.id);
    if (!otp || !otp.codeHash || !otp.codeExpiresAt) {
      await this.auditLoginFailure(target.id, target.companyId, context, 'no_active_code');
      throw new AppError('Invalid or expired code', 401);
    }

    // Expired, or too many wrong attempts already — invalidate and force a resend.
    if (otp.codeExpiresAt.getTime() <= Date.now() || otp.codeAttempts >= OTP_MAX_ATTEMPTS) {
      await this.repo.clearOtp(target.id);
      await this.auditLoginFailure(target.id, target.companyId, context, 'code_expired_or_locked');
      throw new AppError('Invalid or expired code', 401);
    }

    if (!verifyOtp(code, otp.codeHash)) {
      const attempts = await this.repo.incrementOtpAttempts(target.id);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        // Cap reached on this try — burn the code so it cannot be brute-forced further.
        await this.repo.clearOtp(target.id);
      }
      await this.auditLoginFailure(target.id, target.companyId, context, 'invalid_code');
      throw new AppError('Invalid or expired code', 401);
    }

    // Success — consume the single-use code before issuing the session.
    await this.repo.clearOtp(target.id);
    await this.repo.touchLastLogin(target.id);
    const tokens = await this.issueSession(target);
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_AUTH_LOGIN_SUCCESS,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(target.id),
      actor: { userId: undefined, companyId: target.companyId },
      context,
      metadata: { method: 'qrToken' in identifier ? 'qr' : 'phone' },
    });
    return { worker: { id: target.id, companyId: target.companyId }, tokens };
  }

  /**
   * Re-send the OTP for a pending login (SECURITY_PRINCIPLES.md §3). Enumeration-safe
   * like start: a fresh code is issued+sent only for a valid enabled target; any miss
   * returns silently. Rate-limited at the route (anti WhatsApp-bombing).
   */
  async resend(identifier: LoginIdentifier, context: AuditContext): Promise<void> {
    const target = await this.resolveTarget(identifier);
    await this.startForTarget(target, 'qrToken' in identifier ? 'qr' : 'phone', context);
  }

  /**
   * Rotate a worker refresh token (SECURITY_PRINCIPLES.md §4). Mirrors the staff
   * rotation: retire the presented token and issue a successor in the same family,
   * re-minting a short-lived access token from the CURRENT Worker row. Reuse of a
   * revoked/expired token — or losing the single-use race — revokes the whole family
   * AND bumps the worker's tokenVersion (revoke-all). All failures throw 401.
   */
  async refresh(rawRefreshToken: string | undefined, context: AuditContext): Promise<WorkerSessionTokens> {
    if (!rawRefreshToken) {
      throw new AppError('Authentication required', 401);
    }

    const record = await this.refreshRepo.findByHash(hashToken(rawRefreshToken));
    if (!record) {
      throw new AppError('Authentication required', 401);
    }

    if (record.isRevoked || record.expiresAt <= new Date()) {
      await this.mitigateReuse(
        record.workerId,
        record.familyId,
        record.isRevoked ? 'refresh_reuse_detected' : 'refresh_expired',
        context,
      );
      throw new AppError('Authentication required', 401);
    }

    const worker = await this.repo.findAuthState(record.workerId);
    if (!worker || !worker.authEnabled) {
      // Disabled/removed mid-session — deny (disable already revokes the family; here
      // we simply refuse to mint a new access token).
      throw new AppError('Authentication required', 401);
    }

    const newRaw = generateToken();
    const rotated = await this.refreshRepo.rotate(record.id, {
      workerId: worker.id,
      familyId: record.familyId,
      tokenHash: hashToken(newRaw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    if (!rotated) {
      await this.mitigateReuse(record.workerId, record.familyId, 'refresh_reuse_detected', context);
      throw new AppError('Authentication required', 401);
    }

    const accessToken = signWorkerAccessToken(worker.id, worker.companyId, worker.tokenVersion);
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_AUTH_TOKEN_REFRESH,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(worker.id),
      actor: { userId: undefined, companyId: worker.companyId },
      context,
    });
    return { accessToken, refreshToken: newRaw };
  }

  /**
   * Meaningful logout (SECURITY_PRINCIPLES.md §4): best-effort revoke the presented
   * refresh token so it cannot be rotated after the app discards it. Never throws.
   */
  async logout(rawRefreshToken: string | undefined, context: AuditContext): Promise<void> {
    let workerId: number | undefined;
    if (rawRefreshToken) {
      try {
        const hash = hashToken(rawRefreshToken);
        const record = await this.refreshRepo.findByHash(hash);
        workerId = record?.workerId;
        await this.refreshRepo.revokeByHash(hash);
      } catch {
        // Best-effort: a revoke failure must not block logout.
      }
    }
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_AUTH_LOGOUT,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      ...(workerId !== undefined ? { resourceId: String(workerId), actor: { userId: undefined } } : {}),
      context,
    });
  }

  /** Resolve a login target from the re-supplied identifier (qr XOR phone). */
  private async resolveTarget(identifier: LoginIdentifier): Promise<WorkerLoginTarget | null> {
    if ('qrToken' in identifier) {
      return this.repo.findLoginByQrTokenHash(hashToken(identifier.qrToken));
    }
    const e164 = normalizeToE164(identifier.phone);
    return e164 ? this.repo.findEnabledLoginByPhoneE164(e164) : null;
  }

  /** Mint an access + refresh token pair (fresh family) for a worker principal. */
  private async issueSession(target: WorkerLoginTarget): Promise<WorkerSessionTokens> {
    const accessToken = signWorkerAccessToken(target.id, target.companyId, target.tokenVersion);
    const raw = generateToken();
    await this.refreshRepo.create({
      workerId: target.id,
      familyId: randomUUID(),
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return { accessToken, refreshToken: raw };
  }

  /** Revoke the family + bump the worker's tokenVersion (revoke-all) and audit. */
  private async mitigateReuse(
    workerId: number,
    familyId: string,
    reason: 'refresh_reuse_detected' | 'refresh_expired',
    context: AuditContext,
  ): Promise<void> {
    await this.refreshRepo.revokeFamilyAndBumpWorker(workerId, familyId);
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_AUTH_SESSION_REVOKED,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      resourceId: String(workerId),
      actor: { userId: undefined },
      context,
      metadata: { reason, familyId },
    });
  }

  private async auditLoginFailure(
    workerId: number | undefined,
    companyId: number | undefined,
    context: AuditContext,
    reason: string,
  ): Promise<void> {
    await this.audit.log({
      action: AUDIT_ACTIONS.WORKER_AUTH_LOGIN_FAILED,
      resourceType: RESOURCE_TYPES.WORKER_AUTH,
      ...(workerId !== undefined ? { resourceId: String(workerId) } : {}),
      actor: { userId: undefined, companyId },
      context,
      metadata: { reason },
    });
  }
}
