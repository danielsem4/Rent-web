export type PaymentStatus = "PENDING" | "PAID";

/** The property a payment is owed for (summary embedded in the list row). */
export interface IPaymentProperty {
  id: number;
  city: string;
  address: string;
}

/**
 * A payment as returned by `GET /api/payments` (company-scoped). Carries the
 * owning property so the dashboard table can show which apartment each payment
 * is for. Dates arrive as ISO strings.
 */
export interface IPaymentListItem {
  id: number;
  companyId: number;
  propertyId: number;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: PaymentStatus;
  property: IPaymentProperty;
}
