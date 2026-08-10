import { cn } from "@/lib/utils";
import { ticketLevel } from "../lib/indicators";

const DOT: Record<ReturnType<typeof ticketLevel>, string> = {
  none: "bg-emerald-500",
  low: "bg-orange-500",
  high: "bg-red-500",
};

// Count is 0 for now; the Tickets slice will feed real open-ticket counts.
export function TicketIndicator({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-2.5 rounded-full", DOT[ticketLevel(count)])} aria-hidden />
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
