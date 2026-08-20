import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
      <h2 className="text-lg font-semibold">
        {t("payments.title")}
        {!isLoading && !isError && outstanding.length > 0 && (
          <span className="text-muted-foreground ms-2 text-base font-normal">
            ({outstanding.length})
          </span>
        )}
      </h2>

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
        <Card>
          {/* Container scrolls on narrow screens — the page never overflows sideways. */}
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-start text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("payments.property")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("payments.amount")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("payments.dueDate")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("payments.status")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("properties.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((p) => {
                  const overdue = new Date(p.dueDate) < today;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.property.city}</div>
                        <div className="text-muted-foreground">{p.property.address}</div>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {p.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {new Date(p.dueDate).toLocaleDateString(i18n.language)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            overdue
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {overdue
                            ? t("payments.statusOverdue")
                            : t("payments.statusPending")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
