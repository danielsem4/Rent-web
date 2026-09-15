import { z } from 'zod';

/**
 * Zod schemas for the utility-bills sub-resource (SECURITY_PRINCIPLES.md §11 —
 * validation + mass-assignment defense). Non-strict by project convention, so an
 * unknown key — notably a client-supplied `companyId`, `propertyId`, or `id` — is
 * silently STRIPPED. Ownership is always assigned by the service from the trusted
 * `req.currentUser.companyId` and the `:propertyId` path param, never the body.
 */

export const UTILITY_TYPES = ['PROPERTY_TAX', 'ELECTRICITY', 'WATER', 'HOA', 'GAS'] as const;
export const UTILITY_BILL_STATUSES = ['PENDING', 'PAID'] as const;

const type = z.enum(UTILITY_TYPES);
const status = z.enum(UTILITY_BILL_STATUSES);
const amount = z.coerce.number().int('Amount must be a whole number').min(0);
const billDate = z.coerce.date();
const notes = z.string().max(2000);

export const createUtilityBillSchema = z.object({
  type,
  amount,
  dueDate: billDate,
  status: status.optional(),
  paidAt: billDate.optional(),
  notes: notes.optional(),
});

export const updateUtilityBillSchema = z
  .object({
    type: type.optional(),
    amount: amount.optional(),
    dueDate: billDate.optional(),
    status: status.optional(),
    paidAt: billDate.optional(),
    notes: notes.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateUtilityBillDto = z.infer<typeof createUtilityBillSchema>;
export type UpdateUtilityBillDto = z.infer<typeof updateUtilityBillSchema>;
