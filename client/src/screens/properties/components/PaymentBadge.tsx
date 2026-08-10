import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/common/types/property";

const STYLES: Record<PaymentStatus, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  future: "bg-muted text-muted-foreground",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  const label = { paid: t("properties.paid"), overdue: t("properties.overdue"), future: t("properties.future") }[status];
  return (
    <Badge variant="secondary" className={cn(STYLES[status])}>
      {label}
    </Badge>
  );
}
