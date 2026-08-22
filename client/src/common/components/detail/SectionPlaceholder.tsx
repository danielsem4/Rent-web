import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A muted "coming soon" / empty-state card for data groups whose backend has
 * not landed yet. Same visual language as KpiCard's comingSoon state.
 */
export function SectionPlaceholder({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <Card className="opacity-70">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="bg-accent text-muted-foreground flex size-12 items-center justify-center rounded-xl">
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground text-sm">{message}</span>
        </div>
      </CardContent>
    </Card>
  );
}
