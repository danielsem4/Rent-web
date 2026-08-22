import { useTranslation } from "react-i18next";
import { Receipt } from "lucide-react";
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
import { usePropertyExpenses } from "../../hooks/queries/usePropertyGroups";

/** Miscellaneous (non-rent) expenses for the property. */
export function ExpensesCard({ propertyId }: { propertyId: number }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = usePropertyExpenses(propertyId);
  const rows = data ?? [];
  const fmtDate = (v: string) => new Date(v).toLocaleDateString(i18n.language);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4" />
          {t("properties.sectionExpenses")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <AsyncPanel isLoading={isLoading} isError={isError}>
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-6 py-6 text-center text-sm">
              {t("properties.expensesEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("properties.expenseCategory")}</TableHead>
                  <TableHead className="text-end">{t("properties.rentAmount")}</TableHead>
                  <TableHead className="text-end">{t("properties.rentDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>{t(`properties.expenseCategoryValue.${x.category}`)}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {x.amount.toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{fmtDate(x.date)}</TableCell>
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
