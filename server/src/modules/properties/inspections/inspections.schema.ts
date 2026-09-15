import { z } from 'zod';

/**
 * Zod schemas for the periodic-inspections sub-resource. Non-strict — ownership
 * keys in the body are stripped; the service supplies companyId/propertyId.
 */

const inspectionDate = z.coerce.date();
const notes = z.string().max(2000);

export const createInspectionSchema = z
  .object({
    lastInspectionDate: inspectionDate.optional(),
    nextInspectionDate: inspectionDate.optional(),
    notes: notes.optional(),
  })
  .refine((data) => data.lastInspectionDate !== undefined || data.nextInspectionDate !== undefined, {
    message: 'At least one inspection date must be provided',
  });

export const updateInspectionSchema = z
  .object({
    lastInspectionDate: inspectionDate.optional(),
    nextInspectionDate: inspectionDate.optional(),
    notes: notes.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateInspectionDto = z.infer<typeof createInspectionSchema>;
export type UpdateInspectionDto = z.infer<typeof updateInspectionSchema>;
