import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled section card grouping related fields. The body defaults to a
 * two-column responsive grid; pass `bodyClassName` to override (e.g. tables
 * that want full width with no grid). An optional `action` slot sits in the
 * header end (RTL-safe) for panel-level buttons like "Add".
 */
export function Section({
  icon,
  title,
  action,
  bodyClassName,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className={action ? "flex flex-row items-center justify-between gap-2" : undefined}>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className={cn("grid gap-4 sm:grid-cols-2", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}
