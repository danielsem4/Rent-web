import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

/**
 * A fully-resolved, already-sanitized audit row ready for persistence. The
 * service builds this (redacting metadata, flattening actor/context); the
 * repository only writes it. This is the ONLY audit file allowed to touch
 * `prisma` (server/CLAUDE.md layering rule).
 */
export interface AuditLogRow {
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: number | null;
  companyId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface IAuditLogRepository {
  create(row: AuditLogRow): Promise<void>;
}

export class AuditLogRepository implements IAuditLogRepository {
  async create(row: AuditLogRow): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        userId: row.userId,
        companyId: row.companyId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        // Omit when absent so the nullable Json column defaults to NULL (avoids
        // Prisma's JsonNull/DbNull sentinel handling for the common no-metadata case).
        ...(row.metadata !== null
          ? { metadata: row.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
