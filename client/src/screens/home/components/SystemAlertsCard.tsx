import { useTranslation } from "react-i18next";
import { AlertCircle, FileClock, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayments } from "@/hooks/queries/usePayments";
import { useWorkers } from "@/screens/workers/hooks/queries/useWorkers";
import { documentHealth } from "@/screens/workers/lib/expiry";
import { cn } from "@/lib/utils";

/** Midnight today — a pending payment due before this is overdue. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const TONE = {
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  ok: "bg-muted text-muted-foreground",
} as const;

type Tone = keyof typeof TONE;

/** One alert line: tinted icon chip + label + count. Tone goes neutral at 0. */
function AlertRow({
  icon: Icon,
  label,
  count,
  activeTone,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  activeTone: Tone;
  loading?: boolean;
}) {
  const tone: Tone = count > 0 ? activeTone : "ok";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            TONE[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-8" />
      ) : (
        <span
          className={cn(
            "text-xl font-semibold tabular-nums",
            count > 0
              ? tone === "danger"
                ? "text-danger"
                : "text-warning"
              : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * A compact "at a glance" summary of things needing attention, driven entirely
 * by data we already fetch — no new endpoints, no fabricated numbers:
 *   • Overdue payments  = pending payments past their due date.
 *   • Expiring documents = worker passport/visa/insurance dates that are
 *     expired or within the 90-day warning window (see workers/lib/expiry).
 */
export default function SystemAlertsCard() {
  const { t } = useTranslation();
  const payments = usePayments();
  const workers = useWorkers();

  const today = startOfToday();
  const overdueCount =
    payments.data?.filter(
      (p) => p.status === "PENDING" && new Date(p.dueDate) < today,
    ).length ?? 0;

  // Sum every non-OK document across all workers.
  const expiringDocs =
    workers.data?.reduce((sum, w) => sum + documentHealth(w).count, 0) ?? 0;

  const allClear =
    !payments.isLoading &&
    !workers.isLoading &&
    overdueCount === 0 &&
    expiringDocs === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="text-muted-foreground size-4" />
          {t("alerts.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AlertRow
          icon={AlertCircle}
          label={t("alerts.overduePayments")}
          count={overdueCount}
          activeTone="danger"
          loading={payments.isLoading}
        />
        <AlertRow
          icon={expiringDocs > 0 ? FileClock : ShieldCheck}
          label={t("alerts.expiringDocuments")}
          count={expiringDocs}
          activeTone="warning"
          loading={workers.isLoading}
        />
        {allClear && (
          <p className="text-muted-foreground col-span-full text-sm">
            {t("alerts.allClear")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
