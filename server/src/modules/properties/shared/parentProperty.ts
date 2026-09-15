import { AppError } from '../../../shared/errors/AppError';

/**
 * Minimal parent-property lookup — satisfied by `PropertiesRepository.findByIdInCompany`.
 * Property-scoped sub-resources (bills, equipment, guarantees, expenses,
 * inspections) inject this to verify the parent property belongs to the caller's
 * company BEFORE any child query, closing the cross-tenant-via-parent IDOR
 * (SECURITY_PRINCIPLES.md §5/§6). Mirrors `IWorkerLookup` in the documents module.
 */
export interface IPropertyLookup {
  findByIdInCompany(id: number, companyId: number): Promise<{ id: number } | null>;
}

/** Confirm the parent property exists in the caller's company (else 404, no leak). */
export async function assertPropertyInCompany(
  properties: IPropertyLookup,
  propertyId: number,
  companyId: number,
): Promise<void> {
  const property = await properties.findByIdInCompany(propertyId, companyId);
  if (!property) {
    throw new AppError('Property not found', 404);
  }
}
