import type { Request } from 'express';
import type { AuditAction, ResourceType } from '../constants/auditActions';

/**
 * Centralized security audit logging seam (SECURITY_PRINCIPLES.md §18).
 *
 * This is the interface the auth/account/users services depend on to emit
 * security events; the concrete `AuditService` (persisting to the `AuditLog`
 * table) is injected via manual DI in the routers, mirroring the mailer seam
 * (`shared/notifications/mailer.ts`). Services stay Express-free: request-bound
 * context (ip / user-agent / correlation id) is captured in controllers via
 * `buildAuditContext(req)` and passed down as a plain object.
 */

/** Request-derived, non-sensitive context attached to an audit event. */
export interface AuditContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** The principal executing the action, when known. Both are nullable. */
export interface AuditActor {
  userId?: number;
  companyId?: number;
}

export interface AuditEvent {
  action: AuditAction;
  resourceType: ResourceType;
  /** The specific resource acted upon, if addressable (stringified id). */
  resourceId?: string;
  actor?: AuditActor;
  context?: AuditContext;
  /**
   * Extra structured detail (e.g. `{ reason: 'account_disabled' }`). SANITIZED
   * before storage — passwords, tokens, secrets, cookies, jwt, tokenHash are
   * stripped (§18). Never put a raw invite/reset token or password here.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Emit a security audit event. Implementations MUST be resilient: a logging
 * failure must never throw into (and thereby break) the primary request flow.
 */
export interface IAuditLogger {
  log(event: AuditEvent): Promise<void>;
}

/**
 * Extract non-sensitive audit context from an Express request. `req.ip` respects
 * the configured `trust proxy` setting; the user-agent is read directly.
 */
export function buildAuditContext(req: Request): AuditContext {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    requestId: req.requestId,
  };
}
