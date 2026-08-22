import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A token-mapped status pill. Callers pass already-`t()`-resolved text so this
 * stays presentational. Tones map to the shared status tokens so every pill in
 * the app reads as one system (matches OccupancyChip / ExpiryBadge).
 */
export type BadgeTone = "ok" | "success" | "warning" | "danger" | "info" | "muted";

const TONE: Record<BadgeTone, string> = {
  ok: "bg-primary/10 text-primary",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  muted: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  tone = "muted",
  icon: Icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}
