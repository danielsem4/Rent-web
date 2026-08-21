/**
 * Document-expiry alert logic (product req: 90/60/30-day warnings). Severity is
 * derived at RENDER time from the plaintext expiry dates — nothing is stored,
 * mirroring the server's "derived state at read time" convention.
 */
export type ExpirySeverity = "expired" | "d30" | "d60" | "d90" | "ok";

export interface ExpiryStatus {
  severity: ExpirySeverity;
  /** Whole days until expiry; negative once expired. */
  days: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Classify a single expiry date. Returns null when no date is set. */
export function expiryStatus(dateISO: string | null | undefined): ExpiryStatus | null {
  if (!dateISO) return null;
  const target = new Date(dateISO);
  if (Number.isNaN(target.getTime())) return null;
  // Compare at day granularity so "today" reads as 0 days, not a few hours.
  const today = new Date();
  const days = Math.ceil((target.getTime() - today.getTime()) / MS_PER_DAY);
  let severity: ExpirySeverity;
  if (days < 0) severity = "expired";
  else if (days <= 30) severity = "d30";
  else if (days <= 60) severity = "d60";
  else if (days <= 90) severity = "d90";
  else severity = "ok";
  return { severity, days };
}

/** A worker's three tracked documents, in the order they appear in the UI. */
export interface WorkerExpiries {
  passportExpiry?: string | null;
  visaExpiry?: string | null;
  insuranceExpiry?: string | null;
}

const DOC_LABEL_KEYS: Record<keyof WorkerExpiries, string> = {
  passportExpiry: "workers.passport",
  visaExpiry: "workers.visa",
  insuranceExpiry: "workers.insurance",
};

/** The single most-urgent document alert for a worker, or null if none warn. */
export function nearestAlert(
  w: WorkerExpiries,
): { labelKey: string; status: ExpiryStatus } | null {
  let best: { labelKey: string; status: ExpiryStatus } | null = null;
  for (const key of Object.keys(DOC_LABEL_KEYS) as (keyof WorkerExpiries)[]) {
    const status = expiryStatus(w[key]);
    if (!status || status.severity === "ok") continue;
    if (best === null || status.days < best.status.days) {
      best = { labelKey: DOC_LABEL_KEYS[key], status };
    }
  }
  return best;
}

/** Overall document health, folding the three tracked expiries into one badge. */
export type DocumentHealth = "expired" | "expiring" | "ok";

/**
 * The worst severity across a worker's passport/visa/insurance dates, plus how
 * many of them are not "ok". Drives the header badge, the Documents-tab count,
 * and the overview attention card. Dates that are unset are ignored.
 */
export function documentHealth(w: WorkerExpiries): { severity: DocumentHealth; count: number } {
  let expired = 0;
  let expiring = 0;
  for (const key of Object.keys(DOC_LABEL_KEYS) as (keyof WorkerExpiries)[]) {
    const status = expiryStatus(w[key]);
    if (!status || status.severity === "ok") continue;
    if (status.severity === "expired") expired += 1;
    else expiring += 1;
  }
  const count = expired + expiring;
  const severity: DocumentHealth = expired > 0 ? "expired" : expiring > 0 ? "expiring" : "ok";
  return { severity, count };
}

/** Whole years elapsed since a date, or null when the date is missing/invalid. */
export function yearsSince(dateISO: string | null | undefined): number | null {
  if (!dateISO) return null;
  const from = new Date(dateISO);
  if (Number.isNaN(from.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - from.getFullYear();
  // Subtract a year if the anniversary hasn't happened yet this year.
  const beforeAnniversary =
    now.getMonth() < from.getMonth() ||
    (now.getMonth() === from.getMonth() && now.getDate() < from.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}
