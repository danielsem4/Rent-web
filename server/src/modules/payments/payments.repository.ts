import prisma from '../../lib/prisma';
import type { PaymentStatus } from '@prisma/client';

/** A property summary embedded in a payment list row (tenant-scoped join). */
export interface PaymentPropertySummary {
  id: number;
  city: string;
  address: string;
}

/**
 * List projection for GET /api/payments. Carries the owning property's
 * city/address so the dashboard table can show which apartment each payment is
 * for, without a second request. `companyId` is included for parity with the
 * other list projections; no secrets are exposed.
 */
export interface PaymentListItem {
  id: number;
  companyId: number;
  propertyId: number;
  amount: number;
  dueDate: Date;
  paidAt: Date | null;
  status: PaymentStatus;
  property: PaymentPropertySummary;
}

export interface IPaymentsRepository {
  listByCompany(companyId: number): Promise<PaymentListItem[]>;
  listByPropertyInCompany(propertyId: number, companyId: number): Promise<PaymentListItem[]>;
}

/** Projection shared by the company-wide and property-scoped list queries. */
const LIST_SELECT = {
  id: true,
  companyId: true,
  propertyId: true,
  amount: true,
  dueDate: true,
  paidAt: true,
  status: true,
  property: { select: { id: true, city: true, address: true } },
} as const;

export class PaymentsRepository implements IPaymentsRepository {
  async listByCompany(companyId: number): Promise<PaymentListItem[]> {
    // Tenant condition is part of the query — never a post-fetch filter. The
    // property join is reached through the same company-scoped rows.
    return prisma.payment.findMany({
      where: { companyId },
      orderBy: { dueDate: 'asc' },
      select: LIST_SELECT,
    });
  }

  async listByPropertyInCompany(
    propertyId: number,
    companyId: number,
  ): Promise<PaymentListItem[]> {
    // Both tenant + parent conditions inside the query — a foreign-company or
    // wrong-property id simply returns no rows.
    return prisma.payment.findMany({
      where: { companyId, propertyId },
      orderBy: { dueDate: 'desc' },
      select: LIST_SELECT,
    });
  }
}
