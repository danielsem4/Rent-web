import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { propertySchema } from "../schema/propertySchema";
import type { PropertyFormValues } from "../schema/propertySchema";
import type { PropertyInput } from "@/api/propertyApi";
import type { IProperty } from "@/common/types/property";

interface PropertyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: IProperty | null;
  onSubmit: (input: PropertyInput) => void;
  isPending: boolean;
}

const EMPTY: PropertyFormValues = {
  city: "",
  address: "",
  entryCode: "",
  electricMeter: "",
  waterMeter: "",
  ownerName: "",
  ownerPhone: "",
  contractStart: "",
  contractEnd: "",
  monthlyRent: 0,
  capacity: 1,
  notes: "",
};

function isoToInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Empty strings become null so the backend's optional/date fields stay unset. */
function toPayload(v: PropertyFormValues): PropertyInput {
  const clean = (s?: string) => (s && s.trim() !== "" ? s.trim() : null);
  return {
    city: v.city.trim(),
    address: v.address.trim(),
    entryCode: clean(v.entryCode),
    electricMeter: clean(v.electricMeter),
    waterMeter: clean(v.waterMeter),
    ownerName: clean(v.ownerName),
    ownerPhone: clean(v.ownerPhone),
    contractStart: clean(v.contractStart),
    contractEnd: clean(v.contractEnd),
    monthlyRent: v.monthlyRent,
    capacity: v.capacity,
    notes: clean(v.notes),
  };
}

export function PropertyFormDialog({
  open,
  onOpenChange,
  property,
  onSubmit,
  isPending,
}: PropertyFormDialogProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    if (property) {
      reset({
        city: property.city,
        address: property.address,
        entryCode: property.entryCode ?? "",
        electricMeter: property.electricMeter ?? "",
        waterMeter: property.waterMeter ?? "",
        ownerName: property.ownerName ?? "",
        ownerPhone: property.ownerPhone ?? "",
        contractStart: isoToInput(property.contractStart),
        contractEnd: isoToInput(property.contractEnd),
        monthlyRent: property.monthlyRent,
        capacity: property.capacity,
        notes: property.notes ?? "",
      });
    } else {
      reset(EMPTY);
    }
  }, [open, property, reset]);

  const submit = handleSubmit((v) => onSubmit(toPayload(v)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {property ? t("properties.formEditTitle") : t("properties.formCreateTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="city">{t("properties.fCity")}</Label>
            <Input id="city" {...register("city")} aria-invalid={!!errors.city} />
            {errors.city && <p className="text-destructive text-sm">{t(errors.city.message ?? "")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="address">{t("properties.fAddress")}</Label>
            <Input id="address" {...register("address")} aria-invalid={!!errors.address} />
            {errors.address && <p className="text-destructive text-sm">{t(errors.address.message ?? "")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="entryCode">{t("properties.fEntryCode")}</Label>
            <Input id="entryCode" {...register("entryCode")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="capacity">{t("properties.fCapacity")}</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              {...register("capacity", { valueAsNumber: true })}
              aria-invalid={!!errors.capacity}
            />
            {errors.capacity && <p className="text-destructive text-sm">{t(errors.capacity.message ?? "")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="electricMeter">{t("properties.fElectricMeter")}</Label>
            <Input id="electricMeter" {...register("electricMeter")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="waterMeter">{t("properties.fWaterMeter")}</Label>
            <Input id="waterMeter" {...register("waterMeter")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerName">{t("properties.fOwnerName")}</Label>
            <Input id="ownerName" {...register("ownerName")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerPhone">{t("properties.fOwnerPhone")}</Label>
            <Input id="ownerPhone" {...register("ownerPhone")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contractStart">{t("properties.fContractStart")}</Label>
            <Input id="contractStart" type="date" {...register("contractStart")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contractEnd">{t("properties.fContractEnd")}</Label>
            <Input id="contractEnd" type="date" {...register("contractEnd")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="monthlyRent">{t("properties.fMonthlyRent")}</Label>
            <Input
              id="monthlyRent"
              type="number"
              min={0}
              {...register("monthlyRent", { valueAsNumber: true })}
              aria-invalid={!!errors.monthlyRent}
            />
            {errors.monthlyRent && <p className="text-destructive text-sm">{t(errors.monthlyRent.message ?? "")}</p>}
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="notes">{t("properties.fNotes")}</Label>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("properties.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {t("properties.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
