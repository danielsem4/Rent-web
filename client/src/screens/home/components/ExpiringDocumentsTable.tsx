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
 * Dashboard section listing workers whose VISA or PASSPORT is already expired or
 * expires within 30 days — the most urgent first, with a column naming which
 * document. Filtered client-side from the workers list (no dedicated endpoint),
 * mirroring the derived-at-read-time convention. The worker variant of the
 * manager's visa-only table.
 */
export default function ExpiringDocumentsTable() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useWorkers();

  // For each worker, take the more-urgent of visa/passport, keep those expired
  // or ≤30 days out, then sort ascending so expired/soonest lead.
  const rows = (data ?? [])
    .map((w) => {
      const candidates = [
        { labelKey: "workers.visa", dateISO: w.visaExpiry, status: expiryStatus(w.visaExpiry) },
        { labelKey: "workers.passport", dateISO: w.passportExpiry, status: expiryStatus(w.passportExpiry) },
      ].filter((c) => c.status !== null) as {
        labelKey: string;
        dateISO: string | null | undefined;
        status: NonNullable<ReturnType<typeof expiryStatus>>;
      }[];
      if (candidates.length === 0) return null;
      const soonest = candidates.reduce((a, b) => (b.status.days < a.status.days ? b : a));
      return { w, ...soonest };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.status.days <= 30)
    .sort((a, b) => a.status.days - b.status.days);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{t("dashboard.expiringDocuments")}</h2>
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
            {t("dashboard.expiringDocumentsEmpty")}
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
                  <TableHead>{t("dashboard.document")}</TableHead>
                  <TableHead className="tabular-nums">{t("dashboard.expiryDate")}</TableHead>
                  <TableHead className="text-end">{t("workers.alerts")}</TableHead>
                  <TableHead className="text-end">{t("workers.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ w, labelKey, dateISO }) => (
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
                    <TableCell>{t(labelKey)}</TableCell>
                    <TableCell className="tabular-nums">
                      {dateISO ? new Date(dateISO).toLocaleDateString(i18n.language) : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <ExpiryBadge dateISO={dateISO} />
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
