import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { expiryStatus, type ExpirySeverity } from "../lib/expiry";

// Danger for expired / ≤30 days; warning for ≤60 / ≤90. Reuses the shared status
// tokens so workers read as one system with the properties occupancy chips.
const CHIP: Record<Exclude<ExpirySeverity, "ok">, string> = {
  expired: "bg-danger-bg text-danger",
  d30: "bg-danger-bg text-danger",
  d60: "bg-warning-bg text-warning",
  d90: "bg-warning-bg text-warning",
};

/**
 * A compact alert pill for one document date. Renders nothing when the date is
 * absent or comfortably in the future (severity "ok"), unless `showOk` is set
 * (detail view shows a neutral "valid" state).
 */
export function ExpiryBadge({
  dateISO,
  label,
  showOk = false,
  className,
}: {
  dateISO: string | null | undefined;
  label?: string;
  showOk?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const status = expiryStatus(dateISO);
  if (!status) return null;

  if (status.severity === "ok") {
    if (!showOk) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          "bg-muted text-muted-foreground",
          className,
        )}
      >
        {label ? `${label} · ` : ""}
        {t("workers.expiryOk")}
      </span>
    );
  }

  const text =
    status.severity === "expired"
      ? t("workers.expired")
      : t("workers.expiresInDays", { days: status.days });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        CHIP[status.severity],
        className,
      )}
    >
      {status.severity === "expired" ? (
        <AlertTriangle className="size-3.5" aria-hidden />
      ) : (
        <CalendarClock className="size-3.5" aria-hidden />
      )}
      {label ? `${label} · ` : ""}
      {text}
    </span>
  );
}
