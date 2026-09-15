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
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { expiryStatus } from "@/screens/workers/lib/expiry";
import { ExpiryBadge } from "@/screens/workers/components/ExpiryBadge";

/**
 * Dashboard section listing properties whose contract has already ended or ends
 * within 60 days — the most urgent first. Filtered client-side from the
 * properties list (no dedicated endpoint), like the visa table.
 */
export default function EndingContractsTable() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useProperties();

  // Ended or ≤60 days out. Ascending by days so ended/soonest lead.
  const rows = (data ?? [])
    .map((p) => ({ p, status: expiryStatus(p.contractEnd) }))
    .filter((r) => r.status !== null && r.status.days <= 60)
    .sort((a, b) => a.status!.days - b.status!.days);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{t("dashboard.endingContracts")}</h2>
        {!isLoading && !isError && rows.length > 0 && (
          <Badge variant="secondary">{rows.length}</Badge>
        )}
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-6">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {isError && <p className="text-destructive">{t("properties.loadFailed")}</p>}

      {!isLoading && !isError && rows.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            {t("dashboard.endingContractsEmpty")}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("properties.city")}</TableHead>
                  <TableHead className="tabular-nums">{t("properties.contractEnd")}</TableHead>
                  <TableHead className="text-end">{t("payments.status")}</TableHead>
                  <TableHead className="text-end">{t("properties.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ p }) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                          <Home className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium">{p.city}</div>
                          <div className="text-muted-foreground text-sm">{p.address}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.contractEnd
                        ? new Date(p.contractEnd).toLocaleDateString(i18n.language)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <ExpiryBadge dateISO={p.contractEnd} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={t("properties.view")}
                        >
                          <Link to={`/properties/${p.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
