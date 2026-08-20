import { z } from "zod";

// Validation messages are i18n keys, resolved with t() at render (project rule).
// Optional text fields use "" as the empty value from the form; they are stripped
// before hitting the API (see toPropertyInput).
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
  // Number inputs are registered with valueAsNumber, so these receive real
  // numbers. Kept non-negative / positive to match the DB invariants.
  monthlyRent: z.number({ message: "properties.errRent" }).int().min(0, "properties.errRent"),
  maxCapacity: z
    .number({ message: "properties.errMaxCapacity" })
    .int()
    .min(1, "properties.errMaxCapacity"),
  total: z.number({ message: "properties.errTotal" }).int().min(0, "properties.errTotal"),
  notes: z.string().optional(),
})
  // Current occupants can never exceed the maximum capacity (mirrors the server).
  .refine((v) => v.total <= v.maxCapacity, {
    path: ["total"],
    message: "properties.errTotalExceedsMax",
  });

export type PropertyFormValues = z.infer<typeof propertySchema>;

/** Strip empty-string optionals so the server never receives blank dates/text. */
export function toPropertyInput(values: PropertyFormValues) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === "" || value === undefined || value === null) continue;
    out[key] = value;
  }
  return out as PropertyFormValues;
}
