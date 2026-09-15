import { z } from 'zod';

/**
 * Zod schemas for the equipment sub-resource (validation + mass-assignment
 * defense). Non-strict — a client-supplied `companyId`/`propertyId`/`id` is
 * stripped; ownership comes from the trusted context/path in the service.
 */

export const EQUIPMENT_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'BROKEN'] as const;

const name = z.string().min(1, 'Item name is required').max(200);
const quantity = z.coerce.number().int('Quantity must be a whole number').min(0);
const condition = z.enum(EQUIPMENT_CONDITIONS);
const serialNumber = z.string().max(200);
const notes = z.string().max(2000);

export const createEquipmentSchema = z.object({
  name,
  quantity: quantity.optional(),
  condition: condition.optional(),
  serialNumber: serialNumber.optional(),
  notes: notes.optional(),
});

export const updateEquipmentSchema = z
  .object({
    name: name.optional(),
    quantity: quantity.optional(),
    condition: condition.optional(),
    serialNumber: serialNumber.optional(),
    notes: notes.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateEquipmentDto = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentDto = z.infer<typeof updateEquipmentSchema>;
