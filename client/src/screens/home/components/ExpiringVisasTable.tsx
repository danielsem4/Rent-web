import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Eye, HardHat } from "lucide-react";
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
import { useWorkers } from "@/screens/workers/hooks/queries/useWorkers";
import { expiryStatus } from "@/screens/workers/lib/expiry";
import { ExpiryBadge } from "@/screens/workers/components/ExpiryBadge";

/**
 * Dashboard section listing workers whose visa is already expired or expires
 * within 30 days — the most urgent first. Filtered client-side from the workers
 * list (no dedicated endpoint), mirroring the derived-at-read-time convention.
 */
export default function ExpiringVisasTable() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useWorkers();

  // Expired or ≤30 days out. Ascending by days so expired/soonest lead.
  const rows = (data ?? [])
    .map((w) => ({ w, status: expiryStatus(w.visaExpiry) }))
    .filter((r) => r.status !== null && r.status.days <= 30)
    .sort((a, b) => a.status!.days - b.status!.days);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{t("dashboard.expiringVisas")}</h2>
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

      {isError && <p className="text-destructive">{t("workers.loadFailed")}</p>}

      {!isLoading && !isError && rows.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            {t("dashboard.expiringVisasEmpty")}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("workers.name")}</TableHead>
                  <TableHead>{t("workers.nationality")}</TableHead>
                  <TableHead className="tabular-nums">{t("workers.visa")}</TableHead>
                  <TableHead className="text-end">{t("workers.alerts")}</TableHead>
                  <TableHead className="text-end">{t("workers.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ w }) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                          <HardHat className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium">{w.nameHe}</div>
                          <div className="text-muted-foreground text-sm">{w.nameEn}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{w.nationality}</TableCell>
                    <TableCell className="tabular-nums">
                      {w.visaExpiry
                        ? new Date(w.visaExpiry).toLocaleDateString(i18n.language)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <ExpiryBadge dateISO={w.visaExpiry} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={t("workers.view")}
                        >
                          <Link to={`/workers/${w.id}`}>
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
