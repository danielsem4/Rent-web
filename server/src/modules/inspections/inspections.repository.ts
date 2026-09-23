import prisma from '../../lib/prisma';

/** A property summary embedded in an inspection list row (tenant-scoped join). */
export interface InspectionPropertySummary {
  id: number;
  city: string;
  address: string;
}

/**
 * List projection for GET /api/inspections. Carries the owning property's
 * city/address so the dashboard can show which apartment each inspection is for,
 * without a second request. No secrets are exposed.
 */
export interface InspectionListItem {
  id: number;
  companyId: number;
  propertyId: number;
  lastInspectionDate: Date | null;
  nextInspectionDate: Date | null;
  property: InspectionPropertySummary;
}

export interface IInspectionsRepository {
  listByCompany(companyId: number): Promise<InspectionListItem[]>;
}

/** Projection for the company-wide list query. */
const LIST_SELECT = {
  id: true,
  companyId: true,
  propertyId: true,
  lastInspectionDate: true,
  nextInspectionDate: true,
  property: { select: { id: true, city: true, address: true } },
} as const;

export class InspectionsRepository implements IInspectionsRepository {
  async listByCompany(companyId: number): Promise<InspectionListItem[]> {
    // Tenant condition is part of the query — never a post-fetch filter. The
    // property join is reached through the same company-scoped rows. Soonest
    // upcoming inspection first (nulls sort last).
    return prisma.inspection.findMany({
      where: { companyId },
      orderBy: { nextInspectionDate: 'asc' },
      select: LIST_SELECT,
    });
  }
}
