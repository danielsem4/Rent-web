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
import { cn } from "@/lib/utils";
import type { WorkerLanguage } from "@/common/types/worker";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { workerSchema, toWorkerInput } from "./schema/workerSchema";
import type { WorkerFormValues } from "./schema/workerSchema";
import { useWorker } from "./hooks/queries/useWorkers";
import { useCreateWorker, useUpdateWorker } from "./hooks/queries/useWorkerMutations";

/** ISO datetime → yyyy-mm-dd for a native date input (empty when absent). */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

const LANGUAGES: WorkerLanguage[] = ["th", "hi", "si", "he"];

const EMPTY: WorkerFormValues = {
  nameHe: "",
  nameEn: "",
  nationality: "",
  entryDate: "",
  preferredLanguage: "",
  passportNumber: "",
  passportExpiry: "",
  visaType: "",
  visaExpiry: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceCoverageType: "",
  insuranceExpiry: "",
  phone: "",
  employer: "",
  propertyId: "",
  notes: "",
};

// Matches the shadcn Input surface so the native selects read as one system.
const SELECT_CLASS =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function WorkerForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const isEdit = id !== undefined;

  const { data: existing, isLoading: isLoadingExisting } = useWorker(id);
  const { data: properties } = useProperties();
  const create = useCreateWorker();
  const update = useUpdateWorker(id ?? 0);
  const saving = create.isPending || update.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkerFormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: EMPTY,
  });

  // Populate the form once the existing record loads (edit mode).
  useEffect(() => {
    if (existing) {
      reset({
        nameHe: existing.nameHe,
        nameEn: existing.nameEn,
        nationality: existing.nationality,
        entryDate: toDateInput(existing.entryDate),
        preferredLanguage: existing.preferredLanguage ?? "",
        passportNumber: existing.passportNumber ?? "",
        passportExpiry: toDateInput(existing.passportExpiry),
        visaType: existing.visaType ?? "",
        visaExpiry: toDateInput(existing.visaExpiry),
        insuranceProvider: existing.insuranceProvider ?? "",
        insurancePolicyNumber: existing.insurancePolicyNumber ?? "",
        insuranceCoverageType: existing.insuranceCoverageType ?? "",
        insuranceExpiry: toDateInput(existing.insuranceExpiry),
        phone: existing.phone ?? "",
        employer: existing.employer ?? "",
        propertyId: existing.propertyId != null ? String(existing.propertyId) : "",
        notes: existing.notes ?? "",
      });
    }
  }, [existing, reset]);

  const onSubmit = (values: WorkerFormValues) => {
    const input = toWorkerInput(values);
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
    name: keyof WorkerFormValues,
    labelKey: string,
    type: "text" | "date" = "text",
  ) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{t(labelKey)}</Label>
      <Input id={name} type={type} aria-invalid={!!errors[name]} {...register(name)} />
      {errors[name] && <p className="text-destructive text-sm">{t(errors[name]?.message ?? "")}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? t("workers.editTitle") : t("workers.newTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("nameHe", "workers.nameHe")}
              {field("nameEn", "workers.nameEn")}
              {field("nationality", "workers.nationality")}
              {field("entryDate", "workers.entryDate", "date")}

              {/* Preferred language */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="preferredLanguage">{t("workers.preferredLanguage")}</Label>
                <select id="preferredLanguage" className={cn(SELECT_CLASS)} {...register("preferredLanguage")}>
                  <option value="">{t("workers.notSet")}</option>
                  {LANGUAGES.map((lng) => (
                    <option key={lng} value={lng}>
                      {t(`workers.languages.${lng}`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Apartment assignment */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="propertyId">{t("workers.apartment")}</Label>
                <select id="propertyId" className={cn(SELECT_CLASS)} {...register("propertyId")}>
                  <option value="">{t("workers.notSet")}</option>
                  {(properties ?? []).map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.city}, {p.address}
                    </option>
                  ))}
                </select>
              </div>

              {field("passportNumber", "workers.passportNumber")}
              {field("passportExpiry", "workers.passportExpiry", "date")}
              {field("visaType", "workers.visaType")}
              {field("visaExpiry", "workers.visaExpiry", "date")}
              {field("insuranceProvider", "workers.insuranceProvider")}
              {field("insurancePolicyNumber", "workers.insurancePolicyNumber")}
              {field("insuranceCoverageType", "workers.insuranceCoverageType")}
              {field("insuranceExpiry", "workers.insuranceExpiry", "date")}
              {field("phone", "workers.phone")}
              {field("employer", "workers.employer")}
            </div>
            {field("notes", "workers.notes")}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => void navigate("/workers")}>
                {t("workers.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("workers.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
