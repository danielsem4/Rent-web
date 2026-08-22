import { z } from 'zod';

/**
 * Zod schemas for the miscellaneous-expenses sub-resource. Non-strict —
 * ownership keys in the body are stripped; the service supplies companyId/propertyId.
 */

export const EXPENSE_CATEGORIES = ['CLEANING', 'MAINTENANCE', 'PEST_CONTROL', 'OTHER'] as const;

const category = z.enum(EXPENSE_CATEGORIES);
const amount = z.coerce.number().int('Amount must be a whole number').min(0);
const expenseDate = z.coerce.date();
const notes = z.string().max(2000);

export const createExpenseSchema = z.object({
  category,
  amount,
  date: expenseDate,
  notes: notes.optional(),
});

export const updateExpenseSchema = z
  .object({
    category: category.optional(),
    amount: amount.optional(),
    date: expenseDate.optional(),
    notes: notes.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;
