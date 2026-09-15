import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { SectionPlaceholder } from "@/common/components/detail/SectionPlaceholder";
import { StatusBadge, type BadgeTone } from "@/common/components/StatusBadge";
import { cn } from "@/lib/utils";
import type { EquipmentCondition } from "@/common/types/propertyEquipment";
import { GROUP_READY } from "../../lib/dataGroups";
import {
  usePropertyEquipment,
  useCreateEquipment,
  useDeleteEquipment,
} from "../../hooks/queries/usePropertyEquipment";

const CONDITIONS: EquipmentCondition[] = ["NEW", "GOOD", "FAIR", "BROKEN"];
const CONDITION_TONE: Record<EquipmentCondition, BadgeTone> = {
  NEW: "success",
  GOOD: "ok",
  FAIR: "warning",
  BROKEN: "danger",
};
const SELECT_CLASS =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Equipment & inventory with add/remove (manager only). */
export function EquipmentPanel({
  propertyId,
  canWrite,
}: {
  propertyId: number;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const ready = GROUP_READY.equipment;
  const { data, isLoading, isError } = usePropertyEquipment(propertyId, ready);
  const create = useCreateEquipment(propertyId);
  const remove = useDeleteEquipment(propertyId);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<EquipmentCondition>("GOOD");
  const [serialNumber, setSerialNumber] = useState("");

  if (!ready) {
    return (
      <SectionPlaceholder
        icon={Package}
        title={t("properties.sectionEquipment")}
        message={t("properties.comingSoon")}
      />
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        quantity: Number(quantity) || 1,
        condition,
        serialNumber: serialNumber.trim() || undefined,
      },
      {
        onSuccess: () => {
          setName("");
          setQuantity("1");
          setCondition("GOOD");
          setSerialNumber("");
        },
      },
    );
  };

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="size-4" />
          {t("properties.sectionEquipment")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite && (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <Label htmlFor="eq-name">{t("properties.itemName")}</Label>
              <Input id="eq-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-qty">{t("properties.quantity")}</Label>
              <Input
                id="eq-qty"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-cond">{t("properties.condition")}</Label>
              <select
                id="eq-cond"
                className={cn(SELECT_CLASS)}
                value={condition}
                onChange={(e) => setCondition(e.target.value as EquipmentCondition)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`properties.conditionValue.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-serial">{t("properties.serialNumber")}</Label>
              <Input
                id="eq-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={create.isPending || !name.trim()} className="sm:w-fit">
              <Plus className="size-4" />
              {t("properties.addItem")}
            </Button>
          </form>
        )}

        <AsyncPanel isLoading={isLoading} isError={isError}>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">{t("properties.equipmentEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("properties.itemName")}</TableHead>
                  <TableHead className="text-end">{t("properties.quantity")}</TableHead>
                  <TableHead>{t("properties.condition")}</TableHead>
                  <TableHead>{t("properties.serialNumber")}</TableHead>
                  {canWrite && <TableHead className="text-end">{t("properties.actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-end tabular-nums">{item.quantity}</TableCell>
                    <TableCell>
                      <StatusBadge tone={CONDITION_TONE[item.condition]}>
                        {t(`properties.conditionValue.${item.condition}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{item.serialNumber ?? "—"}</TableCell>
                    {canWrite && (
                      <TableCell className="text-end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("properties.removeItem")}
                              disabled={remove.isPending}
                            >
                              <Trash2 className="text-destructive size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("properties.removeItem")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("properties.confirmRemove", { label: item.name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("properties.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => remove.mutate(item.id)}
                              >
                                {t("properties.removeItem")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
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
