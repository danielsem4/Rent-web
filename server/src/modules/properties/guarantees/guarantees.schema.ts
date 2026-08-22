import { z } from 'zod';

/**
 * Zod schemas for the guarantees/deposits sub-resource. Non-strict — ownership
 * keys in the body are stripped; the service supplies companyId/propertyId.
 */

export const GUARANTEE_TYPES = [
  'BANK_GUARANTEE',
  'CASH_DEPOSIT',
  'CHECK',
  'PROMISSORY_NOTE',
  'OTHER',
] as const;
export const GUARANTEE_STATUSES = ['ACTIVE', 'RETURNED', 'EXPIRED', 'CLAIMED'] as const;

const type = z.enum(GUARANTEE_TYPES);
const status = z.enum(GUARANTEE_STATUSES);
const amount = z.coerce.number().int('Amount must be a whole number').min(0);
const bank = z.string().max(200);
const guaranteeDate = z.coerce.date();
const notes = z.string().max(2000);

export const createGuaranteeSchema = z.object({
  type,
  amount,
  bank: bank.optional(),
  expiryDate: guaranteeDate.optional(),
  returnDate: guaranteeDate.optional(),
  status: status.optional(),
  notes: notes.optional(),
});

export const updateGuaranteeSchema = z
  .object({
    type: type.optional(),
    amount: amount.optional(),
    bank: bank.optional(),
    expiryDate: guaranteeDate.optional(),
    returnDate: guaranteeDate.optional(),
    status: status.optional(),
    notes: notes.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateGuaranteeDto = z.infer<typeof createGuaranteeSchema>;
export type UpdateGuaranteeDto = z.infer<typeof updateGuaranteeSchema>;
