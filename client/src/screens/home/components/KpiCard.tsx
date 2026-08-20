import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  /** Already-translated label. */
  title: string;
  icon: LucideIcon;
  /** The metric value; ignored while loading / erroring / coming soon. */
  value?: number;
  /** When set (and not coming soon), the whole card links here. */
  to?: string;
  loading?: boolean;
  error?: boolean;
  errorLabel?: string;
  /** Renders a muted, non-clickable placeholder for not-yet-built domains. */
  comingSoon?: boolean;
  comingSoonLabel?: string;
}

/**
 * A single dashboard KPI tile. Presentational only — the parent resolves labels
 * and passes query state. RTL-safe (logical flex flow, no left/right).
 */
export default function KpiCard({
  title,
  icon: Icon,
  value,
  to,
  loading,
  error,
  errorLabel,
  comingSoon,
  comingSoonLabel,
}: KpiCardProps) {
  const clickable = Boolean(to) && !comingSoon;

  const card = (
    <Card
      className={cn(
        "h-full gap-3 py-5 transition-colors",
        clickable && "hover:border-primary hover:bg-accent/40",
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
            <span className="text-3xl font-semibold tabular-nums">
              {(value ?? 0).toLocaleString()}
            </span>
          )}
        </div>
        <span
          className={cn(
            "bg-accent text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg",
            comingSoon && "opacity-60",
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
