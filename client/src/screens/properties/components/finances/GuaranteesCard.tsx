import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AsyncPanel } from "@/common/components/detail/AsyncPanel";
import { StatusBadge, type BadgeTone } from "@/common/components/StatusBadge";
import type { GuaranteeStatus } from "@/common/types/propertyGuarantee";
import { usePropertyGuarantees } from "../../hooks/queries/usePropertyGroups";

const STATUS_TONE: Record<GuaranteeStatus, BadgeTone> = {
  ACTIVE: "success",
  RETURNED: "muted",
  EXPIRED: "danger",
  CLAIMED: "warning",
};

/** Guarantees & deposits held against the property. */
export function GuaranteesCard({ propertyId }: { propertyId: number }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = usePropertyGuarantees(propertyId);
  const rows = data ?? [];
  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(i18n.language) : "—");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          {t("properties.sectionGuarantees")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <AsyncPanel isLoading={isLoading} isError={isError}>
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-6 py-6 text-center text-sm">
              {t("properties.guaranteesEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("properties.guaranteeType")}</TableHead>
                  <TableHead className="text-end">{t("properties.rentAmount")}</TableHead>
                  <TableHead>{t("properties.bank")}</TableHead>
                  <TableHead>{t("properties.expiry")}</TableHead>
                  <TableHead className="text-end">{t("properties.rentStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{t(`properties.guaranteeTypeValue.${g.type}`)}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {g.amount.toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell>{g.bank ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{fmtDate(g.expiryDate)}</TableCell>
                    <TableCell className="text-end">
                      <StatusBadge tone={STATUS_TONE[g.status]}>
                        {t(`properties.guaranteeStatusValue.${g.status}`)}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AsyncPanel>
      </CardContent>
    </Card>
  );
}
