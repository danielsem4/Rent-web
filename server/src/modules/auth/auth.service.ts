import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AppError } from '../../shared/errors/AppError';
import type { Role } from '../../shared/constants/roles';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
} from '../../shared/config/jwt';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import { generateToken, hashToken } from '../../shared/utils/token';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { IAuthRepository, SafeUser } from './auth.repository';
import type { IRefreshTokenRepository } from './refreshToken.repository';
import type { LoginDto } from './auth.schema';

/** A minted session: a short-lived access JWT + a raw (un-hashed) refresh token. */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly repo: IAuthRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
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

  async login(dto: LoginDto, context: AuditContext): Promise<SessionTokens & { user: SafeUser }> {
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
    // reveals nothing (account exists / password correct / account disabled).
    // The real reason is recorded in the audit trail, not the response.
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

    const accessToken = this.sign(user.id, user.role, user.companyId, user.tokenVersion);
    // Each login starts a fresh token family (a distinct device/session lineage).
    const refreshToken = await this.issueRefreshToken(user.id, randomUUID());
    await this.audit.log({
      action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(user.id),
      actor: { userId: user.id, companyId: user.companyId },
      context,
      metadata: { result: 'success' },
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
    };
  }

  async getMe(userId: number): Promise<SafeUser> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
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
