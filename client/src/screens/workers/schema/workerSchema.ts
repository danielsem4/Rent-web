import { z } from "zod";
import type { IWorkerInput, WorkerLanguage } from "@/common/types/worker";

// Validation messages are i18n keys, resolved with t() at render (project rule).
// All fields are strings in the form (native inputs/selects); empty-string
// optionals are stripped before hitting the API (see toWorkerInput).
export const workerSchema = z.object({
  nameHe: z.string().min(1, "workers.errNameHe"),
  nameEn: z.string().min(1, "workers.errNameEn"),
  nationality: z.string().min(1, "workers.errNationality"),
  entryDate: z.string().optional(),
  preferredLanguage: z.enum(["", "th", "hi", "si", "he"]).optional(),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().optional(),
  visaType: z.string().optional(),
  visaExpiry: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  insuranceCoverageType: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  phone: z.string().optional(),
  employer: z.string().optional(),
  // Property select — "" means no apartment assignment.
  propertyId: z.string().optional(),
  notes: z.string().optional(),
});

export type WorkerFormValues = z.infer<typeof workerSchema>;

/**
 * Convert form values to the API payload: strip empty-string optionals so the
 * server never receives blank dates/text, and coerce `propertyId` to a number
 * (or `null` to clear an assignment).
 */
export function toWorkerInput(values: WorkerFormValues): IWorkerInput {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === "" || value === undefined || value === null) continue;
    out[key] = value;
  }
  // propertyId: a chosen value becomes a number; an unset one is left out so the
  // create path does not touch it. (Clearing on edit is handled below.)
  if (values.propertyId) out.propertyId = Number(values.propertyId);
  else delete out.propertyId;

  if (values.preferredLanguage) out.preferredLanguage = values.preferredLanguage as WorkerLanguage;
  else delete out.preferredLanguage;

  return out as unknown as IWorkerInput;
}
