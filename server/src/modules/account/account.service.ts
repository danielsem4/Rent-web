import { AppError } from '../../shared/errors/AppError';
import { AccountTokenType } from '../../shared/constants/accountTokens';
import { generateToken, hashToken } from '../../shared/utils/token';
import { hashPassword } from '../../shared/utils/password';
import { logger } from '../../shared/logging/logger';
import { AUDIT_ACTIONS, RESOURCE_TYPES } from '../../shared/constants/auditActions';
import type { AuditContext, IAuditLogger } from '../../shared/audit/auditLogger';
import type { AccountMailer } from '../../shared/notifications/mailer';
import type { IAccountRepository } from './account.repository';

/** Invitation link validity — SECURITY policy value (§28). */
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
/** Password-reset link validity — SECURITY policy value (§28). */
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

/** Identical response body regardless of whether the email maps to an account. */
export const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

/** One generic message for every bad-token outcome (missing/expired/used/wrong-type). */
const INVALID_TOKEN_MESSAGE = 'Invalid or expired token';

/**
 * Narrow seam the users module depends on to invite a freshly provisioned user,
 * without pulling in the mailer/clientUrl wiring. `AccountService` implements it.
 */
export interface IInvitationIssuer {
  issueInvitation(userId: number, email: string, context?: AuditContext): Promise<void>;
}

/**
 * Secure account lifecycle (SECURITY_PRINCIPLES.md §3/§24): invitation/set-password
 * and forgot/reset. Tokens are random + single-use + time-limited; only their hash
 * is stored; every successful password change bumps `tokenVersion` (revoke-all).
 * Forgot-password is enumeration-safe (identical outcome for any email).
 */
export class AccountService implements IInvitationIssuer {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly mailer: AccountMailer,
    private readonly clientUrl: string,
    private readonly audit: IAuditLogger,
  ) {}

  /** Issue an invitation (set-password) token for a pending user and mail the link. */
  async issueInvitation(userId: number, email: string, context?: AuditContext): Promise<void> {
    const raw = await this.issueToken(userId, AccountTokenType.INVITATION, INVITATION_TTL_MS);
    await this.mailer.sendInvitation(email, this.link('accept-invitation', raw));
    await this.audit.log({
      action: AUDIT_ACTIONS.INVITATION_SENT,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(userId),
      actor: { userId },
      context,
    });
  }

  /**
   * Enumeration-safe: whether or not the email maps to an active account, the
   * caller returns the SAME 200 body. A reset link is generated only for an
   * existing, ACTIVE user; delivery failures are swallowed (logged generically,
   * no token) so the observable outcome never reveals existence.
   */
  async requestPasswordReset(email: string, context: AuditContext): Promise<void> {
    const user = await this.repo.findUserByEmail(email);
    if (!user || !user.isActive) {
      return;
    }
    try {
      const raw = await this.issueToken(user.id, AccountTokenType.PASSWORD_RESET, RESET_TTL_MS);
      await this.mailer.sendPasswordReset(email, this.link('reset-password', raw));
    } catch (err) {
      // Never surface a difference to the client, and never log the token.
      logger.warn('password_reset_delivery_failed', { userId: user.id, err });
    }
    // Audited only when a real (active) account exists — the enumeration-safe
    // response is unchanged, but the trail records genuine reset requests.
    await this.audit.log({
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(user.id),
      actor: { userId: user.id },
      context,
    });
  }

  /** Accept an invitation: set the first password and activate the account. */
  async acceptInvitation(token: string, password: string, context: AuditContext): Promise<void> {
    const userId = await this.consume(token, AccountTokenType.INVITATION, password, true);
    await this.audit.log({
      action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(userId),
      actor: { userId },
      context,
      // Setting the password bumps tokenVersion (revoke-all) in the repository.
      metadata: { sessionsRevoked: true },
    });
  }

  /** Reset a password with a reset token (does not change activation state). */
  async resetPassword(token: string, password: string, context: AuditContext): Promise<void> {
    const userId = await this.consume(token, AccountTokenType.PASSWORD_RESET, password, false);
    await this.audit.log({
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      resourceType: RESOURCE_TYPES.USER,
      resourceId: String(userId),
      actor: { userId },
      context,
      // The password change bumps tokenVersion (revoke-all) in the repository.
      metadata: { sessionsRevoked: true },
    });
  }

  /** Generate a token, retire prior unused ones of the same type, store the hash. */
  private async issueToken(
    userId: number,
    type: AccountTokenType,
    ttlMs: number,
  ): Promise<string> {
    const raw = generateToken();
    await this.repo.invalidateUnusedTokens(userId, type);
    await this.repo.createToken(userId, type, hashToken(raw), new Date(Date.now() + ttlMs));
    return raw;
  }

  /** Consume a token, set the password, and return the affected user's id. */
  private async consume(
    token: string,
    type: AccountTokenType,
    password: string,
    activate: boolean,
  ): Promise<number> {
    const record = await this.repo.findTokenByHash(hashToken(token), type);
    if (!record || record.usedAt !== null || record.expiresAt <= new Date()) {
      throw new AppError(INVALID_TOKEN_MESSAGE, 400);
    }
    const passwordHash = await hashPassword(password);
    const consumed = await this.repo.consumeTokenAndSetPassword(
      record.id,
      record.userId,
      passwordHash,
      activate,
    );
    if (!consumed) {
      // Lost the single-use race against a concurrent redemption.
      throw new AppError(INVALID_TOKEN_MESSAGE, 400);
    }
    return record.userId;
  }

  private link(path: string, rawToken: string): string {
    return `${this.clientUrl}/${path}?token=${rawToken}`;
  }
}
