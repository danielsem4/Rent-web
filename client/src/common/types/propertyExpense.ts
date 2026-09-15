export type ExpenseCategory = "CLEANING" | "MAINTENANCE" | "PEST_CONTROL" | "OTHER";

/** A miscellaneous expense as returned by GET /properties/:id/expenses. */
export interface IPropertyExpense {
  id: number;
  companyId: number;
  propertyId: number;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
