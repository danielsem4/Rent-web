import { useTranslation } from "react-i18next";
import { Building2, TrendingUp, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { IPropertyStats } from "@/common/types/property";

interface KpiCardsProps {
  stats?: IPropertyStats;
  isLoading: boolean;
}

export function KpiCards({ stats, isLoading }: KpiCardsProps) {
  const { t } = useTranslation();

  const collection =
    stats?.collectionRate == null ? t("properties.notProvided") : `${stats.collectionRate}%`;

  const cards = [
    { key: "apartments", label: t("properties.kpiApartments"), value: stats?.activeApartments ?? 0, icon: Building2, hint: null },
    // openTickets / collectionRate are placeholders until the Tickets/Ledger slices land.
    { key: "tickets", label: t("properties.kpiOpenTickets"), value: stats?.openTickets ?? 0, icon: Wrench, hint: t("properties.kpiComingSoon") },
    { key: "collection", label: t("properties.kpiCollection"), value: collection, icon: TrendingUp, hint: t("properties.kpiComingSoon") },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.key}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">{c.label}</CardTitle>
              <Icon aria-hidden className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-semibold tabular-nums">{c.value}</div>
              )}
              {c.hint && <p className="text-muted-foreground mt-1 text-xs">{c.hint}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
