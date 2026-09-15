import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, UserRound, FileText, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/common/components/detail/Section";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import type { WorkerLanguage } from "@/common/types/worker";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { workerSchema, toWorkerInput } from "./schema/workerSchema";
import type { WorkerFormValues } from "./schema/workerSchema";
import type { StagedDocument } from "./lib/documentUpload";
import { useWorker } from "./hooks/queries/useWorkers";
import { useCreateWorker, useUpdateWorker } from "./hooks/queries/useWorkerMutations";
import { useUploadWorkerDocuments } from "./hooks/queries/useWorkerDocumentMutations";
import WorkerDocuments from "./components/WorkerDocuments";
import WorkerDocumentDraft from "./components/WorkerDocumentDraft";

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
  // Uploads are gated to company managers (UX only; the server is the enforcement point).
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;
  const create = useCreateWorker();
  const update = useUpdateWorker(id ?? 0);
  const uploadDocs = useUploadWorkerDocuments();
  // Documents staged in the browser while creating (no worker id yet).
  const [staged, setStaged] = useState<StagedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const saving = create.isPending || update.isPending || uploading;

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

  const onSubmit = async (values: WorkerFormValues) => {
    const input = toWorkerInput(values);
    if (isEdit) {
      update.mutate(input);
      return;
    }
    // Create, then upload any staged documents to the new worker's id.
    try {
      const worker = await create.mutateAsync(input);
      if (staged.length > 0) {
        setUploading(true);
        const { failed } = await uploadDocs(worker.id, staged);
        if (failed > 0) toast.error(t("workers.documents.someFailed", { count: failed }));
      }
      void navigate("/workers");
    } catch {
      // create failure is already surfaced by the mutation's onError toast.
    } finally {
      setUploading(false);
    }
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {isEdit ? t("workers.editTitle") : t("workers.newTitle")}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <Section icon={<UserRound className="size-4" />} title={t("workers.formSecProfile")}>
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
        </Section>

        <Section icon={<FileText className="size-4" />} title={t("workers.formSecDocuments")}>
          {field("passportNumber", "workers.passportNumber")}
          {field("passportExpiry", "workers.passportExpiry", "date")}
          {field("visaType", "workers.visaType")}
          {field("visaExpiry", "workers.visaExpiry", "date")}
          {field("insuranceProvider", "workers.insuranceProvider")}
          {field("insurancePolicyNumber", "workers.insurancePolicyNumber")}
          {field("insuranceCoverageType", "workers.insuranceCoverageType")}
          {field("insuranceExpiry", "workers.insuranceExpiry", "date")}
        </Section>

        {/* File uploads live on a saved worker (needs an id), so the uploader is
            active in edit mode and shows a save-first hint when creating. */}
        {id !== undefined ? (
          <WorkerDocuments workerId={id} canWrite={canWrite} />
        ) : (
          <WorkerDocumentDraft staged={staged} onChange={setStaged} canWrite={canWrite} />
        )}

        <Section icon={<Phone className="size-4" />} title={t("workers.formSecContact")}>
          {field("phone", "workers.phone")}
          {field("employer", "workers.employer")}
          <div className="sm:col-span-2">{field("notes", "workers.notes")}</div>
        </Section>

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
    </div>
  );
}
