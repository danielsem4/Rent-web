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
}

export class PaymentsRepository implements IPaymentsRepository {
  async listByCompany(companyId: number): Promise<PaymentListItem[]> {
    // Tenant condition is part of the query — never a post-fetch filter. The
    // property join is reached through the same company-scoped rows.
    return prisma.payment.findMany({
      where: { companyId },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        companyId: true,
        propertyId: true,
        amount: true,
        dueDate: true,
        paidAt: true,
        status: true,
        property: { select: { id: true, city: true, address: true } },
      },
    });
  }
}
