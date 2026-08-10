import { z } from "zod";

// Validation messages are i18n keys, resolved with t() at render (see Login pattern).
// Number fields are registered with { valueAsNumber: true }; the shared message key
// covers the type/int/min failure paths so an empty field still shows the right text.
export const propertySchema = z.object({
  city: z.string().min(1, "properties.errCity"),
  address: z.string().min(1, "properties.errAddress"),
  entryCode: z.string().optional(),
  electricMeter: z.string().optional(),
  waterMeter: z.string().optional(),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  monthlyRent: z
    .number({ message: "properties.errRent" })
    .int("properties.errRent")
    .min(0, "properties.errRent"),
  capacity: z
    .number({ message: "properties.errCapacity" })
    .int("properties.errCapacity")
    .min(1, "properties.errCapacity"),
  notes: z.string().optional(),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;
