import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { AppError } from '../../shared/errors/AppError';
import { Role } from '../../shared/constants/roles';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
} from '../../shared/config/jwt';
import { AUDIT_ACTIONS, RESOURCE_TYPES, type AuditAction } from '../../shared/constants/auditActions';
import { generateToken, hashToken } from '../../shared/utils/token';
import { generateTotpSecret, buildOtpAuthUrl, verifyTotp } from '../../shared/utils/totp';
import { encryptSecret, decryptSecret } from '../../shared/utils/encryption';
import { generateRecoveryCodes, hashRecoveryCode } from '../../shared/utils/recoveryCodes';
import { signMfaToken, verifyMfaToken } from '../../shared/utils/mfaToken';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { AuthState, IAuthRepository, SafeUser } from './auth.repository';
import type { IRefreshTokenRepository } from './refreshToken.repository';
import type { IMfaRepository, MfaContext } from './mfa.repository';
import type { LoginDto } from './auth.schema';

/** A minted session: a short-lived access JWT + a raw (un-hashed) refresh token. */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Login succeeded and MFA was not required — a full session was minted. */
export interface SessionResult {
  kind: 'session';
  user: SafeUser;
  tokens: SessionTokens;
}

/** Credentials were valid but a second factor (or enrollment) is required first. */
export interface MfaChallengeResult {
  kind: 'mfa';
  mfaToken: string;
  /** true = the user must ENROLL (no secret yet); false = verify an existing TOTP. */
  setupRequired: boolean;
}

export type LoginResult = SessionResult | MfaChallengeResult;

/** Roles for which MFA is mandatory (SECURITY_PRINCIPLES.md §3/§24). */
function isPrivileged(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.COMPANY_MANAGER;
}

export class AuthService {
  constructor(
    private readonly repo: IAuthRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly mfaRepo: IMfaRepository,
    private readonly audit: IAuditLogger,
  ) {}

  private sign(userId: number, role: Role, companyId: number, tokenVersion: number): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new AppError('JWT_SECRET is not configured', 500);
    }
    // role/companyId are snapshot claims only — the authenticate middleware
    // re-derives them from the DB on every protected request. tokenVersion is
    // compared against the DB value to support revoke-all.
    return jwt.sign({ userId, role, companyId, tokenVersion }, secret, {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  /** Mint + persist a refresh token (hash only). Returns the raw token for the cookie. */
  private async issueRefreshToken(userId: number, familyId: string): Promise<string> {
    const raw = generateToken();
    await this.refreshRepo.create({
      userId,
      familyId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return raw;
  }

  /** Mint an access + refresh token pair (fresh family), audit, and package the result. */
  private async issueSession(
    auth: { id: number; role: Role; companyId: number; tokenVersion: number },
    safeUser: SafeUser,
    context: AuditContext,
    action: AuditAction,
    metadata?: Record<string, unknown>,
  ): Promise<SessionResult> {
    const accessToken = this.sign(auth.id, auth.role, auth.companyId, auth.tokenVersion);
    const refreshToken = await this.issueRefreshToken(auth.id, randomUUID());
    await this.audit.log({
      action,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(auth.id),
      actor: { userId: auth.id, companyId: auth.companyId },
      context,
      metadata,
    });
    return { kind: 'session', user: safeUser, tokens: { accessToken, refreshToken } };
  }

  async login(dto: LoginDto, context: AuditContext): Promise<LoginResult> {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) {
      // No such account — no actor id to record. The attempted email is PII
      // (not a secret) and is retained for brute-force/credential-stuffing
      // forensics; the response stays generic (enumeration-safe).
      await this.audit.log({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        resourceType: RESOURCE_TYPES.AUTH,
        context,
        metadata: { reason: 'unknown_email', email: dto.email },
      });
      throw new AppError('Invalid email or password', 401);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.audit.log({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        resourceType: RESOURCE_TYPES.AUTH,
        resourceId: String(user.id),
        actor: { userId: user.id, companyId: user.companyId },
        context,
        metadata: { reason: 'bad_credentials' },
      });
      throw new AppError('Invalid email or password', 401);
    }

    // Anti-enumeration: a credential-holder must NOT learn the account is
    // disabled. Return the SAME generic 401 as bad credentials so the response
    // reveals nothing. The real reason is recorded in the audit trail.
    if (!user.isActive) {
      await this.audit.log({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        resourceType: RESOURCE_TYPES.AUTH,
        resourceId: String(user.id),
        actor: { userId: user.id, companyId: user.companyId },
        context,
        metadata: { reason: 'account_disabled' },
      });
      throw new AppError('Invalid email or password', 401);
    }

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };

    // MFA is mandatory for privileged roles and for anyone who has enabled it.
    const mustMfa = user.isMfaEnabled || isPrivileged(user.role);
    if (!mustMfa) {
      return this.issueSession(user, safeUser, context, AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS, {
        result: 'success',
      });
    }

    // Second factor required — issue a short-lived challenge/enroll token (NO
    // session cookies). Enrolled users verify a code; privileged-but-unenrolled
    // users are hard-gated into enrollment before any session (fail closed).
    const purpose = user.isMfaEnabled ? 'mfa_challenge' : 'mfa_enroll';
    const mfaToken = signMfaToken(user.id, purpose);
    await this.audit.log({
      action: AUDIT_ACTIONS.MFA_CHALLENGE_ISSUED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(user.id),
      actor: { userId: user.id, companyId: user.companyId },
      context,
      metadata: { mode: user.isMfaEnabled ? 'challenge' : 'enroll' },
    });
    return { kind: 'mfa', mfaToken, setupRequired: !user.isMfaEnabled };
  }

  async getMe(userId: number): Promise<SafeUser> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  /**
   * Second-factor login (SECURITY_PRINCIPLES.md §3). Verifies the challenge token,
   * then a TOTP code or a single-use recovery code, and only then mints a full
   * session. Every failure is audited and returns the same generic 401.
   */
  async completeMfaChallenge(
    mfaToken: string,
    code: string,
    context: AuditContext,
  ): Promise<SessionResult> {
    const userId = verifyMfaToken(mfaToken, 'mfa_challenge');

    const authState = await this.repo.findAuthById(userId);
    const mfa = await this.mfaRepo.getMfa(userId);
    if (!authState || !authState.isActive || !mfa || !mfa.isMfaEnabled || !mfa.mfaSecret) {
      await this.auditMfaFailure(userId, context, 'not_enrolled_or_inactive');
      throw new AppError('Invalid or expired MFA token', 401);
    }

    const method = await this.verifyMfaCode(userId, code, mfa);
    if (!method) {
      await this.auditMfaFailure(userId, context, 'invalid_code');
      throw new AppError('Invalid authentication code', 401);
    }

    const safeUser = await this.repo.findById(userId);
    if (!safeUser) {
      throw new AppError('Invalid or expired MFA token', 401);
    }

    if (method === 'recovery') {
      await this.audit.log({
        action: AUDIT_ACTIONS.MFA_RECOVERY_CODE_USED,
        resourceType: RESOURCE_TYPES.AUTH,
        resourceId: String(userId),
        actor: { userId, companyId: authState.companyId },
        context,
      });
    }
    return this.issueSession(authState, safeUser, context, AUDIT_ACTIONS.MFA_LOGIN_SUCCESS, {
      method,
    });
  }

  /** Try TOTP, then a single-use recovery code. Returns the method used, or null. */
  private async verifyMfaCode(
    userId: number,
    code: string,
    mfa: MfaContext,
  ): Promise<'totp' | 'recovery' | null> {
    if (mfa.mfaSecret) {
      try {
        if (verifyTotp(code, decryptSecret(mfa.mfaSecret))) {
          return 'totp';
        }
      } catch {
        // Decryption failure (misconfig/tamper) — fall through to recovery, fail closed.
      }
    }
    if (await this.mfaRepo.consumeRecoveryCode(userId, hashRecoveryCode(code))) {
      return 'recovery';
    }
    return null;
  }

  private async auditMfaFailure(
    userId: number,
    context: AuditContext,
    reason: string,
  ): Promise<void> {
    await this.audit.log({
      action: AUDIT_ACTIONS.MFA_LOGIN_FAILED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(userId),
      actor: { userId },
      context,
      metadata: { reason },
    });
  }

  /**
   * Begin TOTP enrollment: generate a secret, persist it ENCRYPTED as pending
   * (MFA stays disabled until verify-setup), and return the provisioning data
   * (otpauth URI + QR data URL + plaintext recovery codes shown ONCE).
   */
  async beginMfaSetup(userId: number): Promise<{
    otpauthUrl: string;
    qrDataUrl: string;
    recoveryCodes: string[];
  }> {
    const mfa = await this.mfaRepo.getMfa(userId);
    const safeUser = await this.repo.findById(userId);
    if (!mfa || !safeUser) {
      throw new AppError('User not found', 404);
    }
    if (mfa.isMfaEnabled) {
      // No silent secret rotation — disable first (with step-up) to re-enroll.
      throw new AppError('MFA is already enabled', 409);
    }

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpAuthUrl(safeUser.email, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    const recoveryCodes = generateRecoveryCodes();

    await this.mfaRepo.savePendingSecret(
      userId,
      encryptSecret(secret),
      recoveryCodes.map(hashRecoveryCode),
    );

    return { otpauthUrl, qrDataUrl, recoveryCodes };
  }

  /**
   * Complete enrollment: verify a TOTP code against the pending secret and enable
   * MFA. When reached mid-login via an enroll token (`enrollMode`), a full session
   * is issued so the just-enrolled user is logged in.
   */
  async completeMfaSetup(
    userId: number,
    code: string,
    context: AuditContext,
    enrollMode: boolean,
  ): Promise<SessionResult | null> {
    const mfa = await this.mfaRepo.getMfa(userId);
    if (!mfa || !mfa.mfaSecret) {
      throw new AppError('MFA setup has not been started', 400);
    }
    if (mfa.isMfaEnabled) {
      throw new AppError('MFA is already enabled', 409);
    }
    if (!verifyTotp(code, decryptSecret(mfa.mfaSecret))) {
      throw new AppError('Invalid authentication code', 400);
    }

    await this.mfaRepo.enableMfa(userId);
    await this.audit.log({
      action: AUDIT_ACTIONS.MFA_SETUP_COMPLETED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(userId),
      actor: { userId },
      context,
    });

    if (!enrollMode) {
      return null; // caller already had a session (voluntary enrollment)
    }
    const authState = await this.repo.findAuthById(userId);
    const safeUser = await this.repo.findById(userId);
    if (!authState || !authState.isActive || !safeUser) {
      throw new AppError('Authentication required', 401);
    }
    return this.issueSession(authState, safeUser, context, AUDIT_ACTIONS.MFA_LOGIN_SUCCESS, {
      via: 'enrollment',
    });
  }

  /**
   * Disable MFA after a step-up check (current password OR a valid TOTP code).
   * Clears all secret material. A privileged user who disables MFA is forced back
   * into enrollment on their next login (login re-gates), so this never bypasses
   * the mandatory requirement — it only resets the factor.
   */
  async disableMfa(
    userId: number,
    input: { password?: string; code?: string },
    context: AuditContext,
  ): Promise<void> {
    const mfa = await this.mfaRepo.getMfa(userId);
    if (!mfa || !mfa.isMfaEnabled) {
      throw new AppError('MFA is not enabled', 400);
    }

    let verified = false;
    if (input.code && mfa.mfaSecret) {
      try {
        verified = verifyTotp(input.code, decryptSecret(mfa.mfaSecret));
      } catch {
        verified = false;
      }
    }
    if (!verified && input.password) {
      const passwordHash = await this.mfaRepo.getPasswordHash(userId);
      verified = passwordHash ? await bcrypt.compare(input.password, passwordHash) : false;
    }
    if (!verified) {
      throw new AppError('Invalid credentials', 401);
    }

    await this.mfaRepo.disableMfa(userId);
    await this.audit.log({
      action: AUDIT_ACTIONS.MFA_DISABLED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(userId),
      actor: { userId },
      context,
    });
  }

  /**
   * Rotate a refresh token (SECURITY_PRINCIPLES.md §4). The refresh cookie is the
   * sole credential (the 15m access token is usually already expired here). On a
   * valid token: retire it and issue a successor in the same family, then re-mint
   * a 15m access token from the CURRENT DB row (never the old token's claims).
   *
   * REUSE DETECTION: a missing/unknown token is denied (no actor to act on). A
   * REVOKED or EXPIRED token — or losing the single-use rotation race — means a
   * previously-rotated token was replayed: the whole family is revoked AND the
   * user's tokenVersion is bumped (revoke-all), so no already-issued access token
   * survives the breach. All failures throw 401; the controller clears cookies.
   */
  async refresh(rawRefreshToken: string | undefined, context: AuditContext): Promise<SessionTokens> {
    if (!rawRefreshToken) {
      throw new AppError('Authentication required', 401);
    }

    const record = await this.refreshRepo.findByHash(hashToken(rawRefreshToken));
    if (!record) {
      // Unknown token: cannot identify a family/user to mitigate — just deny.
      throw new AppError('Authentication required', 401);
    }

    if (record.isRevoked || record.expiresAt <= new Date()) {
      await this.mitigateReuse(
        record.userId,
        record.familyId,
        record.isRevoked ? 'refresh_reuse_detected' : 'refresh_expired',
        context,
      );
      throw new AppError('Authentication required', 401);
    }

    const user = await this.repo.findAuthById(record.userId);
    if (!user || !user.isActive) {
      // Disabled/removed mid-session — deny (the disable/revoke flow revokes the
      // family; here we simply refuse to mint a new access token).
      throw new AppError('Authentication required', 401);
    }

    const newRaw = generateToken();
    const rotated = await this.refreshRepo.rotate(record.id, {
      userId: user.id,
      familyId: record.familyId,
      tokenHash: hashToken(newRaw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    if (!rotated) {
      // Lost the single-use race: the token was concurrently rotated/revoked ⇒ reuse.
      await this.mitigateReuse(record.userId, record.familyId, 'refresh_reuse_detected', context);
      throw new AppError('Authentication required', 401);
    }

    const accessToken = this.sign(user.id, user.role, user.companyId, user.tokenVersion);
    await this.audit.log({
      action: AUDIT_ACTIONS.AUTH_TOKEN_REFRESH,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(user.id),
      actor: { userId: user.id, companyId: user.companyId },
      context,
    });
    return { accessToken, refreshToken: newRaw };
  }

  /** Revoke the family + bump tokenVersion (revoke-all) and audit the breach. */
  private async mitigateReuse(
    userId: number,
    familyId: string,
    reason: 'refresh_reuse_detected' | 'refresh_expired',
    context: AuditContext,
  ): Promise<void> {
    await this.refreshRepo.revokeFamilyAndBumpUser(userId, familyId);
    await this.audit.log({
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(userId),
      actor: { userId },
      context,
      metadata: { reason, familyId },
    });
  }

  /**
   * Meaningful logout (SECURITY_PRINCIPLES.md §4): best-effort revoke the presented
   * refresh token so it cannot be rotated after the cookie is cleared. Never throws —
   * logout must always succeed from the client's perspective.
   */
  async logout(rawRefreshToken: string | undefined, context: AuditContext): Promise<void> {
    let userId: number | undefined;
    if (rawRefreshToken) {
      try {
        const hash = hashToken(rawRefreshToken);
        const record = await this.refreshRepo.findByHash(hash);
        userId = record?.userId;
        await this.refreshRepo.revokeByHash(hash);
      } catch {
        // Best-effort: a revoke failure must not block logout.
      }
    }
    await this.audit.log({
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      resourceType: RESOURCE_TYPES.AUTH,
      ...(userId !== undefined ? { resourceId: String(userId), actor: { userId } } : {}),
      context,
    });
  }
}
