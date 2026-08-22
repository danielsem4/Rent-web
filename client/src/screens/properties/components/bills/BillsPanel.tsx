import { useTranslation } from "react-i18next";
import { Receipt } from "lucide-react";
import { AsyncPanel } from "@/common/components/detail/AsyncPanel";
import { SectionPlaceholder } from "@/common/components/detail/SectionPlaceholder";
import { DataTable, type DataColumn } from "@/common/components/detail/DataTable";
import { StatusBadge } from "@/common/components/StatusBadge";
import type { IUtilityBill } from "@/common/types/propertyBill";
import { GROUP_READY } from "../../lib/dataGroups";
import { usePropertyBills } from "../../hooks/queries/usePropertyGroups";

/** Utility bills & municipal payments (Arnona, electricity, water, HOA, gas). */
export function BillsPanel({ propertyId }: { propertyId: number }) {
  const { t, i18n } = useTranslation();
  const ready = GROUP_READY.bills;
  const { data, isLoading, isError } = usePropertyBills(propertyId, ready);

  if (!ready) {
    return (
      <SectionPlaceholder
        icon={Receipt}
        title={t("properties.sectionBills")}
        message={t("properties.comingSoon")}
      />
    );
  }

  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(i18n.language) : "—");

  const columns: DataColumn<IUtilityBill>[] = [
    { header: t("properties.billTypeCol"), cell: (b) => t(`properties.billType.${b.type}`) },
    {
      header: t("properties.rentAmount"),
      align: "end",
      numeric: true,
      cell: (b) => b.amount.toLocaleString(i18n.language),
    },
    { header: t("properties.dueDate"), numeric: true, cell: (b) => fmtDate(b.dueDate) },
    { header: t("properties.paidAt"), numeric: true, cell: (b) => fmtDate(b.paidAt) },
    {
      header: t("properties.rentStatus"),
      align: "end",
      cell: (b) => {
        if (b.status === "PAID") {
          return <StatusBadge tone="success">{t("properties.billStatus.PAID")}</StatusBadge>;
        }
        return (
          <StatusBadge tone={b.overdue ? "danger" : "muted"}>
            {b.overdue ? t("properties.rentStatusOverdue") : t("properties.billStatus.PENDING")}
          </StatusBadge>
        );
      },
    },
  ];

  return (
    <AsyncPanel isLoading={isLoading} isError={isError}>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(b) => b.id}
        empty={t("properties.billsEmpty")}
      />
    </AsyncPanel>
  );
}
