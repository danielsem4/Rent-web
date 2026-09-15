import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ListTable, type ListColumn } from "@/common/components/ListTable";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { useWorkers } from "./hooks/queries/useWorkers";
import { useDeleteWorker } from "./hooks/queries/useWorkerMutations";
import { nearestAlert } from "./lib/expiry";
import { ExpiryBadge } from "./components/ExpiryBadge";

type WorkerRow = NonNullable<ReturnType<typeof useWorkers>["data"]>[number];

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

  const apartmentOf = (w: WorkerRow) =>
    w.propertyId != null ? (propertyLabel.get(w.propertyId) ?? "—") : "—";

  const columns: ListColumn<WorkerRow>[] = [
    {
      header: t("workers.name"),
      cell: (w) => (
        <div>
          <div className="font-medium">{w.nameHe}</div>
          <div className="text-muted-foreground text-xs">{w.nameEn}</div>
        </div>
      ),
    },
    { header: t("workers.nationality"), cell: (w) => w.nationality },
    { header: t("workers.apartment"), cell: (w) => apartmentOf(w) },
    {
      header: t("workers.alerts"),
      cell: (w) => {
        const alert = nearestAlert(w);
        return alert ? (
          <ExpiryBadge dateISO={alertDate(w, alert.labelKey)} label={t(alert.labelKey)} />
        ) : (
          <span className="text-muted-foreground text-xs">{t("workers.expiryOk")}</span>
        );
      },
    },
    {
      header: t("workers.actions"),
      align: "end",
      cell: (w) => (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="icon" aria-label={t("workers.view")}>
            <Link to={`/workers/${w.id}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
          {canWrite && (
            <>
              <Button asChild variant="outline" size="icon" aria-label={t("workers.edit")}>
                <Link to={`/workers/${w.id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
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
      ),
    },
  ];

  return (
    <ListTable<WorkerRow>
      title={t("workers.title")}
      subtitle={t("workers.subtitle")}
      data={workers}
      isLoading={isLoading}
      isError={isError}
      errorText={t("workers.loadFailed")}
      emptyText={t("workers.empty")}
      columns={columns}
      rowKey={(w) => w.id}
      searchPlaceholder={t("workers.searchPlaceholder")}
      searchText={(w) => `${w.nameHe} ${w.nameEn} ${w.nationality} ${apartmentOf(w)}`}
      action={
        canWrite && (
          <Button asChild className="rounded-lg">
            <Link to="/workers/new">
              <UserPlus className="size-4" />
              {t("workers.add")}
            </Link>
          </Button>
        )
      }
    />
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
