import { z } from 'zod';

export const createPropertySchema = z.object({
  city: z.string().min(1, 'City is required'),
  address: z.string().min(1, 'Address is required'),
  entryCode: z.string().nullish(),
  electricMeter: z.string().nullish(),
  waterMeter: z.string().nullish(),
  ownerName: z.string().nullish(),
  ownerPhone: z.string().nullish(),
  contractStart: z.coerce.date().nullish(),
  contractEnd: z.coerce.date().nullish(),
  monthlyRent: z.coerce.number().int().min(0).default(0),
  capacity: z.coerce.number().int().min(1).default(1),
  notes: z.string().nullish(),
});

// All fields optional on update (PATCH-like PUT).
export const updatePropertySchema = createPropertySchema.partial();

export type CreatePropertyDto = z.infer<typeof createPropertySchema>;
export type UpdatePropertyDto = z.infer<typeof updatePropertySchema>;
