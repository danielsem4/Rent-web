/** A periodic inspection as returned by GET /properties/:id/inspections. */
export interface IPropertyInspection {
  id: number;
  companyId: number;
  propertyId: number;
  lastInspectionDate: string | null;
  nextInspectionDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
