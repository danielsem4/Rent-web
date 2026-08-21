import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { useWorkers } from "./hooks/queries/useWorkers";
import { useDeleteWorker } from "./hooks/queries/useWorkerMutations";
import { nearestAlert } from "./lib/expiry";
import { ExpiryBadge } from "./components/ExpiryBadge";

export default function Workers() {
  const { t } = useTranslation();
  const { data: workers, isLoading, isError } = useWorkers();
  const { data: properties } = useProperties();
  const remove = useDeleteWorker();
  // UX-only gating — the server is the enforcement point (workers get 403 on writes).
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;

  // propertyId → "City, Address" for the apartment column.
  const propertyLabel = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of properties ?? []) map.set(p.id, `${p.city}, ${p.address}`);
    return map;
  }, [properties]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("workers.title")}</h1>
        {canWrite && (
          <Button asChild className="rounded-full">
            <Link to="/workers/new">
              <Plus className="size-4" />
              {t("workers.add")}
            </Link>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-10">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {isError && <p className="text-destructive">{t("workers.loadFailed")}</p>}

      {workers && workers.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            {t("workers.empty")}
          </CardContent>
        </Card>
      )}

      {workers && workers.length > 0 && (
        <Card>
          {/* Container scrolls on narrow screens — the page never overflows sideways. */}
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-start text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("workers.name")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("workers.nationality")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("workers.apartment")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("workers.alerts")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("workers.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => {
                  const alert = nearestAlert(w);
                  return (
                    <tr key={w.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{w.nameHe}</div>
                        <div className="text-muted-foreground text-xs">{w.nameEn}</div>
                      </td>
                      <td className="px-4 py-3">{w.nationality}</td>
                      <td className="px-4 py-3">
                        {w.propertyId != null ? (propertyLabel.get(w.propertyId) ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {alert ? (
                          <ExpiryBadge dateISO={alertDate(w, alert.labelKey)} label={t(alert.labelKey)} />
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("workers.expiryOk")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" aria-label={t("workers.view")}>
                            <Link to={`/workers/${w.id}`}>
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                          {canWrite && (
                            <>
                              <Button asChild variant="ghost" size="icon" aria-label={t("workers.edit")}>
                                <Link to={`/workers/${w.id}/edit`}>
                                  <Pencil className="size-4" />
                                </Link>
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("workers.delete")}
                                    disabled={remove.isPending}
                                  >
                                    <Trash2 className="text-destructive size-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t("workers.delete")}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t("workers.confirmDelete", { label: w.nameHe })}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("workers.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction
                                      variant="destructive"
                                      onClick={() => remove.mutate(w.id)}
                                    >
                                      {t("workers.delete")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
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
    </div>
  );
}

/** Resolve which expiry date the nearest-alert label refers to. */
function alertDate(
  w: { passportExpiry?: string | null; visaExpiry?: string | null; insuranceExpiry?: string | null },
  labelKey: string,
): string | null | undefined {
  if (labelKey === "workers.passport") return w.passportExpiry;
  if (labelKey === "workers.visa") return w.visaExpiry;
  return w.insuranceExpiry;
}
