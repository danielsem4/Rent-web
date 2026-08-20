import { logger, redact } from '../logging/logger';
import type { AuditEvent, IAuditLogger } from './auditLogger';
import type { AuditLogRow, IAuditLogRepository } from './audit.repository';

/**
 * Centralized audit logger (SECURITY_PRINCIPLES.md §18).
 *
 * Builds a durable `AuditLog` row for each security event: it SANITIZES the
 * caller-supplied metadata (reusing the operational logger's `redact()`, so
 * passwords/tokens/secrets/cookies/jwt/tokenHash can never be persisted) and
 * flattens actor/context onto the row.
 *
 * RESILIENT / NON-BLOCKING: a persistence failure is caught and reported via the
 * operational logger, then swallowed — audit logging must never throw into the
 * primary request flow (a logging outage cannot become an availability outage).
 * Not run inside any business `$transaction`, so it also can't roll one back.
 */
export class AuditService implements IAuditLogger {
  constructor(private readonly repo: IAuditLogRepository) {}

  async log(event: AuditEvent): Promise<void> {
    try {
      const sanitizedMetadata =
        event.metadata !== undefined
          ? (redact(event.metadata) as Record<string, unknown>)
          : null;

      const row: AuditLogRow = {
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        userId: event.actor?.userId ?? null,
        companyId: event.actor?.companyId ?? null,
        ipAddress: event.context?.ip ?? null,
        userAgent: event.context?.userAgent ?? null,
        metadata: sanitizedMetadata,
      };

      await this.repo.create(row);
    } catch (err) {
      // Never propagate: log the failure operationally and continue. The action
      // itself already succeeded/failed on its own terms; only the audit trail
      // write failed.
      logger.error('audit_write_failed', {
        action: event.action,
        resourceType: event.resourceType,
        requestId: event.context?.requestId,
        err,
      });
    }
  }
}
