import { AppError } from '../errors/AppError';
import type { CurrentUser } from '../middlewares/authenticate';

/** A CurrentUser that belongs to a company (companyId guaranteed non-null). */
export type TenantUser = CurrentUser & { companyId: number };

/**
 * Narrow a company-scoped principal's `companyId` to a non-null number for use as
 * a tenant scope in queries.
 *
 * `companyId` is nullable because a SUPER_ADMIN is platform-scoped (belongs to no
 * company). Feature routes gate SUPER_ADMIN out via `authorize(...)`, so a
 * company-less principal never reaches tenant-scoped services in practice — but
 * this FAILS CLOSED (403) as defense in depth if one ever did, rather than
 * letting a `null` scope leak into a query (which Prisma would treat as
 * `IS NULL`, a cross-tenant hazard). SECURITY_PRINCIPLES.md §6.
 */
export function tenantId(current: CurrentUser | undefined): number {
  if (!current || current.companyId === null) {
    throw new AppError('Forbidden', 403);
  }
  return current.companyId;
}
