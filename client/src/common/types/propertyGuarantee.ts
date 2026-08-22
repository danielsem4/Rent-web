export type GuaranteeType =
  | "BANK_GUARANTEE"
  | "CASH_DEPOSIT"
  | "CHECK"
  | "PROMISSORY_NOTE"
  | "OTHER";
export type GuaranteeStatus = "ACTIVE" | "RETURNED" | "EXPIRED" | "CLAIMED";

/** A guarantee/deposit as returned by GET /properties/:id/guarantees. */
export interface IPropertyGuarantee {
  id: number;
  companyId: number;
  propertyId: number;
  type: GuaranteeType;
  amount: number;
  bank: string | null;
  expiryDate: string | null;
  returnDate: string | null;
  status: GuaranteeStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
