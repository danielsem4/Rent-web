import { useTranslation } from "react-i18next";
import { Loader2, Banknote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataColumn } from "@/common/components/detail/DataTable";
import { StatusBadge } from "@/common/components/StatusBadge";
import { usePropertyRentHistory } from "../../hooks/queries/usePropertyGroups";
import type { IPaymentListItem } from "@/common/types/payment";

/** Midnight today — a PENDING payment past its due date is overdue. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Monthly rent history for one property, from the property-scoped payments
 * endpoint (server verifies parent ownership + tenant scope).
 */
export function RentHistoryCard({ propertyId }: { propertyId: number }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = usePropertyRentHistory(propertyId);
  const today = startOfToday();

  const rows = data ?? [];

  const columns: DataColumn<IPaymentListItem>[] = [
    {
      header: t("properties.rentDate"),
      numeric: true,
      cell: (p) => new Date(p.dueDate).toLocaleDateString(i18n.language),
    },
    {
      header: t("properties.rentAmount"),
      align: "end",
      numeric: true,
      cell: (p) => p.amount.toLocaleString(i18n.language),
    },
    {
      header: t("properties.rentStatus"),
      align: "end",
      cell: (p) => {
        if (p.status === "PAID") {
          return <StatusBadge tone="success">{t("properties.rentStatusPaid")}</StatusBadge>;
        }
        const overdue = new Date(p.dueDate) < today;
        return (
          <StatusBadge tone={overdue ? "danger" : "muted"}>
            {overdue ? t("properties.rentStatusOverdue") : t("properties.rentStatusPending")}
          </StatusBadge>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Banknote className="size-4" />
        {t("properties.sectionRent")}
      </h3>

      {isLoading ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 py-8">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="text-destructive py-8 text-center">
            {t("properties.loadFailedSection")}
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          empty={t("properties.rentEmpty")}
        />
      )}
    </div>
  );
}
