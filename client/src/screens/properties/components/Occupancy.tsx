import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Occupancy = current occupants (`total`) against the maximum (`maxCapacity`).
 * Shared between the property list (compact chip) and detail (full bar) so the
 * two screens read as one system. Colours use the shared status tokens.
 */
type OccupancyState = "ok" | "full" | "over";

function stateOf(total: number, maxCapacity: number): OccupancyState {
  if (maxCapacity <= 0 || total > maxCapacity) return "over";
  if (total >= maxCapacity) return "full";
  return "ok";
}

/** 0–100 fill percentage, clamped so an over-capacity value still caps the bar. */
function percent(total: number, maxCapacity: number): number {
  if (maxCapacity <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((total / maxCapacity) * 100)));
}

const FILL: Record<OccupancyState, string> = {
  ok: "bg-primary",
  full: "bg-warning",
  over: "bg-danger",
};

const CHIP: Record<OccupancyState, string> = {
  ok: "bg-muted text-foreground",
  full: "bg-warning-bg text-warning",
  over: "bg-danger-bg text-danger",
};

/** Compact inline pill for dense lists — "👥 total / max". */
export function OccupancyChip({
  total,
  maxCapacity,
  className,
}: {
  total: number;
  maxCapacity: number;
  className?: string;
}) {
  const state = stateOf(total, maxCapacity);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        CHIP[state],
        className,
      )}
    >
      <Users className="size-3.5" aria-hidden />
      {total} / {maxCapacity}
    </span>
  );
}

/** Full labelled bar for the detail hero. */
export function OccupancyBar({
  total,
  maxCapacity,
}: {
  total: number;
  maxCapacity: number;
}) {
  const { t } = useTranslation();
  const state = stateOf(total, maxCapacity);
  const pct = percent(total, maxCapacity);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4" aria-hidden />
          {t("properties.occupancy")}
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-sm font-semibold">
            {total} / {maxCapacity}
          </span>
          {state !== "ok" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                state === "full" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger",
              )}
            >
              {t("properties.occupancyFull")}
            </span>
          )}
        </span>
      </div>
      <div
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={maxCapacity}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", FILL[state])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
