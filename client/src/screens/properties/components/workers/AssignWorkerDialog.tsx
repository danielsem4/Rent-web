import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { IWorkerListItem } from "@/common/types/worker";
import { useWorkers } from "@/screens/workers/hooks/queries/useWorkers";
import { nearestAlert } from "@/screens/workers/lib/expiry";
import { ExpiryBadge } from "@/screens/workers/components/ExpiryBadge";
import { useAssignWorkerToProperty } from "@/screens/properties/hooks/queries/usePropertyWorkerMutations";

/** First+last initial of a name, for the avatar placeholder swatch. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Which expiry date the nearest-alert label refers to (mirrors WorkersPanel). */
function alertDate(w: IWorkerListItem, labelKey: string): string | null | undefined {
  if (labelKey === "workers.passport") return w.passportExpiry;
  if (labelKey === "workers.visa") return w.visaExpiry;
  return w.insuranceExpiry;
}

/** One selectable worker card in the picker list. */
function WorkerCard({
  worker,
  selected,
  onSelect,
}: {
  worker: IWorkerListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const alert = nearestAlert(worker);
  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex-row items-center gap-3 p-3",
        selected && "ring-ring ring-2",
      )}
    >
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-medium">
        {initials(worker.nameEn || worker.nameHe)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{worker.nameHe}</div>
        <div className="text-muted-foreground truncate text-xs">{worker.nameEn}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="secondary">{worker.nationality}</Badge>
        {alert && (
          <ExpiryBadge
            dateISO={alertDate(worker, alert.labelKey)}
            label={t(alert.labelKey)}
          />
        )}
      </div>
    </Card>
  );
}

/**
 * Assign an EXISTING (currently unassigned) worker to this property. Candidates
 * are the company's workers with no `propertyId`, shown as a searchable,
 * scrollable list of cards. Tapping a card selects it; the footer button
 * commits. Capacity is enforced server-side; this dialog is only offered when
 * the property still has room.
 */
export function AssignWorkerDialog({
  propertyId,
  open,
  onOpenChange,
}: {
  propertyId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useWorkers();
  const assign = useAssignWorkerToProperty(propertyId);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");

  const unassigned = (data ?? []).filter((w) => w.propertyId == null);
  const q = query.trim().toLowerCase();
  const results = q
    ? unassigned.filter((w) =>
        [w.nameHe, w.nameEn, w.nationality, w.phone].some((f) =>
          f?.toLowerCase().includes(q),
        ),
      )
    : unassigned;

  // Reset selection + search whenever the sheet closes, so a re-open starts blank.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected("");
      setQuery("");
    }
    onOpenChange(next);
  };

  const onConfirm = () => {
    if (!selected) return;
    assign.mutate(Number(selected), { onSuccess: () => handleOpenChange(false) });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("properties.assignWorkerTitle")}</SheetTitle>
          <SheetDescription>{t("properties.assignWorkerDesc")}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-4 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : unassigned.length === 0 ? (
          <p className="text-muted-foreground px-4 text-sm">
            {t("properties.noUnassignedWorkers")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("properties.searchWorkers")}
                className="ps-9"
                aria-label={t("properties.searchWorkers")}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  {t("properties.noSearchResults")}
                </p>
              ) : (
                results.map((w) => (
                  <WorkerCard
                    key={w.id}
                    worker={w}
                    selected={selected === String(w.id)}
                    onSelect={() => setSelected(String(w.id))}
                  />
                ))
              )}
            </div>
          </div>
        )}

        <SheetFooter>
          <Button onClick={onConfirm} disabled={!selected || assign.isPending}>
            {assign.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("properties.addWorker")}
          </Button>
          <SheetClose asChild>
            <Button variant="outline">{t("properties.cancel")}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
