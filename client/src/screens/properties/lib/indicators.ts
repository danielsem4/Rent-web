import type { PaymentStatus } from "@/common/types/property";

export type TicketLevel = "none" | "low" | "high";

/** Spec §3A ticket indicator: 0 = green, 1 = orange, 2+ = red. */
export function ticketLevel(count: number): TicketLevel {
  if (count <= 0) return "none";
  if (count === 1) return "low";
  return "high";
}

/**
 * Payment status for the grid. There is no ledger data yet, so this always
 * returns "future" (gray). Kept pure so the Ledger slice can feed real
 * month-to-date status through the same rendering path.
 */
export function paymentStatus(): PaymentStatus {
  return "future";
}

/** "occupied/capacity" — occupied is 0 until the Tenants slice lands. */
export function formatOccupancy(occupied: number, capacity: number): string {
  return `${occupied}/${capacity}`;
}

/** ISO date → yyyy-mm-dd, or null for missing/invalid input. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
