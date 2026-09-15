import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye, UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { AsyncPanel } from "@/common/components/detail/AsyncPanel";
import { DataTable, type DataColumn } from "@/common/components/detail/DataTable";
import type { IProperty } from "@/common/types/property";
import type { IWorkerListItem } from "@/common/types/worker";
import { useWorkers } from "@/screens/workers/hooks/queries/useWorkers";
import { nearestAlert } from "@/screens/workers/lib/expiry";
import { ExpiryBadge } from "@/screens/workers/components/ExpiryBadge";
import { useUnassignWorker } from "@/screens/properties/hooks/queries/usePropertyWorkerMutations";
import { AssignWorkerDialog } from "./AssignWorkerDialog";

/** Which expiry date the nearest-alert label refers to (mirrors Workers.tsx). */
function alertDate(w: IWorkerListItem, labelKey: string): string | null | undefined {
  if (labelKey === "workers.passport") return w.passportExpiry;
  if (labelKey === "workers.visa") return w.visaExpiry;
  return w.insuranceExpiry;
}

/** Per-row unassign action, guarded by a confirmation dialog. */
function UnassignWorkerButton({
  worker,
  propertyId,
}: {
  worker: IWorkerListItem;
  propertyId: number;
}) {
  const { t } = useTranslation();
  const unassign = useUnassignWorker(propertyId);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("properties.unassign")}>
          <UserMinus className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("properties.unassignConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("properties.unassignConfirmDesc", { name: worker.nameHe })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("properties.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => unassign.mutate(worker.id)}
          >
            {t("properties.unassign")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Foreign workers housed at this property. Managers can assign an existing
 * (unassigned) worker or unassign one; the "Add worker" action is disabled once
 * the property is at capacity (live worker count === `maxCapacity`). Capacity is
 * enforced server-side — this gating is UX only.
 */
export function WorkersPanel({
  property,
  canWrite,
}: {
  property: IProperty;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useWorkers();
  const [assignOpen, setAssignOpen] = useState(false);

  const rows = (data ?? []).filter((w) => w.propertyId === property.id);
  const isFull = rows.length >= property.maxCapacity;

  const columns: DataColumn<IWorkerListItem>[] = [
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
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={t("workers.view")}>
            <Link to={`/workers/${w.id}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
          {canWrite && <UnassignWorkerButton worker={w} propertyId={property.id} />}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm tabular-nums">
          {t("properties.occupancy")}: {rows.length} / {property.maxCapacity}
        </span>
        {canWrite &&
          (isFull ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span wrapper keeps the tooltip working on a disabled button */}
                  <span tabIndex={0}>
                    <Button disabled>
                      <UserPlus className="size-4" />
                      {t("properties.addWorker")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("properties.propertyFull")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button onClick={() => setAssignOpen(true)}>
              <UserPlus className="size-4" />
              {t("properties.addWorker")}
            </Button>
          ))}
      </div>

      <AsyncPanel isLoading={isLoading} isError={isError}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(w) => w.id}
          empty={t("properties.workersEmpty")}
        />
      </AsyncPanel>

      {canWrite && (
        <AssignWorkerDialog
          propertyId={property.id}
          open={assignOpen}
          onOpenChange={setAssignOpen}
        />
      )}
    </div>
  );
}
