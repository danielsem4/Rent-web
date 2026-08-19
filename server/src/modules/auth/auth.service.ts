import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../../shared/errors/AppError';
import type { Role } from '../../shared/constants/roles';
import {
  ACCESS_TOKEN_TTL,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
} from '../../shared/config/jwt';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { IAuthRepository, SafeUser } from './auth.repository';
import type { LoginDto } from './auth.schema';

export class AuthService {
  constructor(
    private readonly repo: IAuthRepository,
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

  async login(
    dto: LoginDto,
    context: AuditContext,
  ): Promise<{ token: string; user: SafeUser }> {
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

    const token = this.sign(user.id, user.role, user.companyId, user.tokenVersion);
    await this.audit.log({
      action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(user.id),
      actor: { userId: user.id, companyId: user.companyId },
      context,
      metadata: { result: 'success' },
    });
    return {
      token,
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
   * Re-issue a fresh token for an already-authenticated user. Role/companyId and
   * tokenVersion are taken from the CURRENT DB row, never copied from the old
   * token's (possibly stale) claims. A disabled account cannot refresh.
   */
  async refresh(userId: number, context: AuditContext): Promise<{ token: string }> {
    const user = await this.repo.findAuthById(userId);
    if (!user || !user.isActive) {
      throw new AppError('Authentication required', 401);
    }
    const token = this.sign(user.id, user.role, user.companyId, user.tokenVersion);
    await this.audit.log({
      action: AUDIT_ACTIONS.AUTH_TOKEN_REFRESH,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: String(user.id),
      actor: { userId: user.id, companyId: user.companyId },
      context,
    });
    return { token };
  }
}
