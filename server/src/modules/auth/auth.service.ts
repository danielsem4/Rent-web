import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
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
import {
  generateNumericOtp,
  hashOtp,
  verifyOtp,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
} from '../../shared/utils/otp';
import { signMfaToken, verifyMfaToken } from '../../shared/utils/mfaToken';
import type { AccountMailer } from '../../shared/notifications/mailer';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { AuthState, IAuthRepository, SafeUser } from './auth.repository';
import type { IRefreshTokenRepository } from './refreshToken.repository';
import type { IMfaRepository } from './mfa.repository';
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

/** Credentials were valid but a second factor (emailed code) is required first. */
export interface MfaChallengeResult {
  kind: 'mfa';
  mfaToken: string;
}

export type LoginResult = SessionResult | MfaChallengeResult;

/** Roles for which 2FA is mandatory (SECURITY_PRINCIPLES.md §3/§24). */
function isPrivileged(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.COMPANY_MANAGER;
}

export class AuthService {
  constructor(
    private readonly repo: IAuthRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly mfaRepo: IMfaRepository,
    private readonly audit: IAuditLogger,
    private readonly mailer: AccountMailer,
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

    // 2FA is mandatory for privileged roles (SECURITY_PRINCIPLES.md §3/§24).
    if (!isPrivileged(user.role)) {
      return this.issueSession(user, safeUser, context, AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS, {
        result: 'success',
      });
    }

    // Second factor required — email a one-time code and issue a short-lived
    // challenge token (NO session cookies). The code's hash is stored server-side;
    // the client posts the token + code to /mfa/challenge to complete login.
    await this.issueEmailCode(user.id, user.email);
    const mfaToken = signMfaToken(user.id, 'mfa_challenge');
    await this.audit.log({
      action: AUDIT_ACTIONS.MFA_CHALLENGE_ISSUED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(user.id),
      actor: { userId: user.id, companyId: user.companyId },
      context,
      metadata: { channel: 'email' },
    });
    return { kind: 'mfa', mfaToken };
  }

  /** Generate a fresh email OTP, persist its hash + expiry, and send it. */
  private async issueEmailCode(userId: number, email: string): Promise<void> {
    const code = generateNumericOtp();
    await this.mfaRepo.saveEmailCode(userId, hashOtp(code), new Date(Date.now() + OTP_TTL_MS));
    // Delivery is a mailer concern; the console mailer prints it in dev, SMTP sends
    // it in prod. The plaintext code is never persisted or logged here.
    await this.mailer.sendMfaCode(email, code);
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
   * then the emailed one-time code (constant-time hash compare, expiry + attempt
   * checks), and only then mints a full session. The code is single-use: it is
   * cleared on success, on expiry, and once the attempt cap is hit (forcing a
   * resend). Every failure is audited and returns the same generic 401.
   */
  async completeMfaChallenge(
    mfaToken: string,
    code: string,
    context: AuditContext,
  ): Promise<SessionResult> {
    const userId = verifyMfaToken(mfaToken, 'mfa_challenge');

    const authState = await this.repo.findAuthById(userId);
    const otp = await this.mfaRepo.getEmailCode(userId);
    if (!authState || !authState.isActive || !otp || !otp.codeHash || !otp.codeExpiresAt) {
      await this.auditMfaFailure(userId, context, 'no_active_code_or_inactive');
      throw new AppError('Invalid or expired code', 401);
    }

    // Expired, or too many wrong attempts already — invalidate and force a resend.
    if (otp.codeExpiresAt.getTime() <= Date.now() || otp.codeAttempts >= OTP_MAX_ATTEMPTS) {
      await this.mfaRepo.clearEmailCode(userId);
      await this.auditMfaFailure(userId, context, 'code_expired_or_locked');
      throw new AppError('Invalid or expired code', 401);
    }

    if (!verifyOtp(code, otp.codeHash)) {
      const attempts = await this.mfaRepo.incrementAttempts(userId);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        // Cap reached on this try — burn the code so it cannot be brute-forced further.
        await this.mfaRepo.clearEmailCode(userId);
      }
      await this.auditMfaFailure(userId, context, 'invalid_code');
      throw new AppError('Invalid or expired code', 401);
    }

    const safeUser = await this.repo.findById(userId);
    if (!safeUser) {
      throw new AppError('Invalid or expired code', 401);
    }

    // Success — consume the single-use code before issuing the session.
    await this.mfaRepo.clearEmailCode(userId);
    return this.issueSession(authState, safeUser, context, AUDIT_ACTIONS.MFA_LOGIN_SUCCESS, {
      method: 'email',
    });
  }

  /**
   * Re-send the emailed code for a pending challenge (SECURITY_PRINCIPLES.md §3).
   * Verifies the challenge token, re-checks the user is still active + privileged,
   * issues a FRESH code (resetting the attempt counter), and returns a new
   * challenge token so its lifetime tracks the new code. Rate-limited at the route.
   */
  async resendMfaCode(mfaToken: string, context: AuditContext): Promise<{ mfaToken: string }> {
    const userId = verifyMfaToken(mfaToken, 'mfa_challenge');
    const authState = await this.repo.findAuthById(userId);
    const user = await this.repo.findById(userId);
    if (!authState || !authState.isActive || !user || !isPrivileged(authState.role)) {
      throw new AppError('Invalid or expired MFA token', 401);
    }

    await this.issueEmailCode(userId, user.email);
    await this.audit.log({
      action: AUDIT_ACTIONS.MFA_CHALLENGE_ISSUED,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(userId),
      actor: { userId, companyId: authState.companyId },
      context,
      metadata: { channel: 'email', resend: true },
    });
    return { mfaToken: signMfaToken(userId, 'mfa_challenge') };
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
