/**
 * A foreign-worker record managed by company staff. The two regulated
 * identifiers (`passportNumber`, `insurancePolicyNumber`) are protected on the
 * server and only returned on a single-record read (GET /:id) — the list endpoint
 * omits them, so they are optional here.
 */
export interface IWorker {
  id: number;
  companyId: number;
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate?: string | null;
  preferredLanguage?: WorkerLanguage | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  visaType?: string | null;
  visaExpiry?: string | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceCoverageType?: string | null;
  insuranceExpiry?: string | null;
  phone?: string | null;
  employer?: string | null;
  propertyId?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Languages a worker may prefer (drives the deferred AI-translation feature). */
export type WorkerLanguage = "th" | "hi" | "si" | "he";

/** List projection — same shape minus the two protected identifiers. */
export type IWorkerListItem = Omit<IWorker, "passportNumber" | "insurancePolicyNumber">;

/** Writable payload for create/update (no server-owned fields). */
export interface IWorkerInput {
  nameHe: string;
  nameEn: string;
  nationality: string;
  entryDate?: string;
  preferredLanguage?: WorkerLanguage;
  passportNumber?: string;
  passportExpiry?: string;
  visaType?: string;
  visaExpiry?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceCoverageType?: string;
  insuranceExpiry?: string;
  phone?: string;
  employer?: string;
  propertyId?: number | null;
  notes?: string;
}
