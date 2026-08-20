import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { propertySchema, toPropertyInput } from "./schema/propertySchema";
import type { PropertyFormValues } from "./schema/propertySchema";
import { useProperty } from "./hooks/queries/useProperties";
import { useCreateProperty, useUpdateProperty } from "./hooks/queries/usePropertyMutations";

/** ISO datetime → yyyy-mm-dd for a native date input (empty when absent). */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
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
  maxCapacity: 1,
  total: 0,
  notes: "",
};

export default function PropertyForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const isEdit = id !== undefined;

  const { data: existing, isLoading: isLoadingExisting } = useProperty(id);
  const create = useCreateProperty();
  const update = useUpdateProperty(id ?? 0);
  const saving = create.isPending || update.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: EMPTY,
  });

  // Populate the form once the existing record loads (edit mode).
  useEffect(() => {
    if (existing) {
      reset({
        city: existing.city,
        address: existing.address,
        entryCode: existing.entryCode ?? "",
        electricMeter: existing.electricMeter ?? "",
        waterMeter: existing.waterMeter ?? "",
        ownerName: existing.ownerName ?? "",
        ownerPhone: existing.ownerPhone ?? "",
        contractStart: toDateInput(existing.contractStart),
        contractEnd: toDateInput(existing.contractEnd),
        monthlyRent: existing.monthlyRent,
        maxCapacity: existing.maxCapacity,
        total: existing.total,
        notes: existing.notes ?? "",
      });
    }
  }, [existing, reset]);

  const onSubmit = (values: PropertyFormValues) => {
    const input = toPropertyInput(values);
    if (isEdit) update.mutate(input);
    else create.mutate(input);
  };

  if (isEdit && isLoadingExisting) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10">
        <Loader2 className="size-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  const field = (
    name: keyof PropertyFormValues,
    labelKey: string,
    type: "text" | "number" | "date" = "text",
  ) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{t(labelKey)}</Label>
      <Input
        id={name}
        type={type}
        aria-invalid={!!errors[name]}
        {...register(name, type === "number" ? { valueAsNumber: true } : {})}
      />
      {errors[name] && (
        <p className="text-destructive text-sm">{t(errors[name]?.message ?? "")}</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? t("properties.editTitle") : t("properties.newTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("city", "properties.city")}
              {field("address", "properties.address")}
              {field("ownerName", "properties.ownerName")}
              {field("ownerPhone", "properties.ownerPhone")}
              {field("monthlyRent", "properties.rent", "number")}
              {field("maxCapacity", "properties.maxCapacity", "number")}
              {field("total", "properties.total", "number")}
              {field("entryCode", "properties.entryCode")}
              {field("electricMeter", "properties.electricMeter")}
              {field("waterMeter", "properties.waterMeter")}
              {field("contractStart", "properties.contractStart", "date")}
              {field("contractEnd", "properties.contractEnd", "date")}
            </div>
            {field("notes", "properties.notes")}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => void navigate("/properties")}>
                {t("properties.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("properties.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
