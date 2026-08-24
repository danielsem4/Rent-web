import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Eye, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/common/components/StatusBadge";
import { OccupancyChip } from "@/screens/properties/components/Occupancy";
import { usePayments } from "@/hooks/queries/usePayments";

/** Midnight today — a payment due before this and still pending is overdue. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function OutstandingPaymentsTable() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = usePayments();

  // Outstanding = not yet paid. Paid rows are excluded from this table.
  const outstanding = data?.filter((p) => p.status === "PENDING") ?? [];
  const today = startOfToday();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{t("payments.title")}</h2>
        {!isLoading && !isError && outstanding.length > 0 && (
          <Badge variant="secondary">
            {t("payments.itemCount", { count: outstanding.length })}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-6">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {isError && <p className="text-destructive">{t("payments.loadFailed")}</p>}

      {!isLoading && !isError && outstanding.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            {t("payments.empty")}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && outstanding.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payments.property")}</TableHead>
                  <TableHead className="text-end">{t("payments.amount")}</TableHead>
                  <TableHead>{t("payments.dueDate")}</TableHead>
                  <TableHead className="text-end">{t("properties.occupancy")}</TableHead>
                  <TableHead className="text-end">{t("payments.status")}</TableHead>
                  <TableHead className="text-end">{t("properties.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((p) => {
                  const overdue = new Date(p.dueDate) < today;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                            <Home className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium">{p.property.city}</div>
                            <div className="text-muted-foreground text-sm">
                              {p.property.address}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {p.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {new Date(p.dueDate).toLocaleDateString(i18n.language)}
                      </TableCell>
                      <TableCell className="text-end">
                        <OccupancyChip
                          total={p.property.total}
                          maxCapacity={p.property.maxCapacity}
                        />
                      </TableCell>
                      <TableCell className="text-end">
                        <StatusBadge tone={overdue ? "danger" : "muted"}>
                          {overdue
                            ? t("payments.statusOverdue")
                            : t("payments.statusPending")}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            aria-label={t("properties.view")}
                          >
                            <Link to={`/properties/${p.propertyId}`}>
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
