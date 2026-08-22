export type UtilityType = "PROPERTY_TAX" | "ELECTRICITY" | "WATER" | "HOA" | "GAS";
export type UtilityBillStatus = "PENDING" | "PAID";

/** A utility/municipal bill as returned by GET /properties/:id/utility-bills. */
export interface IUtilityBill {
  id: number;
  companyId: number;
  propertyId: number;
  type: UtilityType;
  status: UtilityBillStatus;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  /** Derived server-side: PENDING and past due. */
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}
