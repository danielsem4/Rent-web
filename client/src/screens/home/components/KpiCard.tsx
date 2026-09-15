import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/hooks/common/useCountUp";
import { cn } from "@/lib/utils";

/** Per-domain accent. Drives the leading edge + tinted icon chip. */
export type KpiAccent = "info" | "success" | "warning" | "primary" | "muted";

const ACCENT: Record<KpiAccent, { edge: string; chip: string }> = {
  info: { edge: "border-s-info", chip: "bg-info-bg text-info" },
  success: { edge: "border-s-success", chip: "bg-success-bg text-success" },
  warning: { edge: "border-s-warning", chip: "bg-warning-bg text-warning" },
  primary: { edge: "border-s-primary", chip: "bg-primary/10 text-primary" },
  muted: { edge: "border-s-border", chip: "bg-muted text-muted-foreground" },
};

interface KpiCardProps {
  /** Already-translated label. */
  title: string;
  icon: LucideIcon;
  /** The metric value; ignored while loading / erroring / coming soon. */
  value?: number;
  /** Domain accent color for the leading edge + icon chip. */
  accent?: KpiAccent;
  /** When set (and not coming soon), the whole card links here. */
  to?: string;
  loading?: boolean;
  error?: boolean;
  errorLabel?: string;
  /** Renders a muted, non-clickable placeholder for not-yet-built domains. */
  comingSoon?: boolean;
  comingSoonLabel?: string;
}

/** Renders the metric with a one-time count-up (reduced-motion safe). */
function CountValue({ value }: { value: number }) {
  const display = useCountUp(value);
  return (
    <span className="text-3xl font-semibold tabular-nums">
      {display.toLocaleString()}
    </span>
  );
}

/**
 * A single dashboard KPI tile. Presentational only — the parent resolves labels
 * and passes query state. RTL-safe (logical flex flow + `border-s` accent).
 */
export default function KpiCard({
  title,
  icon: Icon,
  value,
  accent = "muted",
  to,
  loading,
  error,
  errorLabel,
  comingSoon,
  comingSoonLabel,
}: KpiCardProps) {
  const clickable = Boolean(to) && !comingSoon;
  const tone = comingSoon ? ACCENT.muted : ACCENT[accent];

  const card = (
    <Card
      interactive={clickable}
      className={cn(
        "h-full gap-3 border-s-4 py-5",
        tone.edge,
        comingSoon && "opacity-70",
      )}
    >
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">{title}</span>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : comingSoon ? (
            <span className="text-muted-foreground text-sm">{comingSoonLabel}</span>
          ) : error ? (
            <span className="text-destructive text-sm">{errorLabel}</span>
          ) : (
            <CountValue value={value ?? 0} />
          )}
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            tone.chip,
            comingSoon && "opacity-70",
          )}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );

  if (clickable) {
    return (
      <Link
        to={to as string}
        className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {card}
      </Link>
    );
  }

  return card;
}
