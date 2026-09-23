/** The property an inspection belongs to (summary embedded in the list row). */
export interface IInspectionProperty {
  id: number;
  city: string;
  address: string;
}

/**
 * An inspection as returned by `GET /api/inspections` (company-scoped). Carries
 * the owning property so the dashboard can show which apartment each inspection
 * is for. Dates arrive as ISO strings (or null when unset).
 */
export interface IInspectionListItem {
  id: number;
  companyId: number;
  propertyId: number;
  lastInspectionDate: string | null;
  nextInspectionDate: string | null;
  property: IInspectionProperty;
}
