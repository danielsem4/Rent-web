import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Home, Wallet, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/common/components/detail/Section";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { propertySchema, toPropertyInput } from "./schema/propertySchema";
import type { PropertyFormValues } from "./schema/propertySchema";
import type { StagedImage } from "./lib/imageUpload";
import { useProperty } from "./hooks/queries/useProperties";
import { useCreateProperty, useUpdateProperty } from "./hooks/queries/usePropertyMutations";
import { useUploadPropertyImages } from "./hooks/queries/usePropertyImageMutations";
import PropertyImages from "./components/gallery/PropertyImages";
import PropertyImageDraft from "./components/gallery/PropertyImageDraft";

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
  advanceNoticeDays: undefined,
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
  // Uploads are gated to company managers (UX only; the server is the enforcement point).
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;
  const create = useCreateProperty();
  const update = useUpdateProperty(id ?? 0);
  const uploadImages = useUploadPropertyImages();
  // Images staged in the browser while creating (no property id yet).
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const saving = create.isPending || update.isPending || uploading;

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
        advanceNoticeDays: existing.advanceNoticeDays ?? undefined,
        monthlyRent: existing.monthlyRent,
        maxCapacity: existing.maxCapacity,
        total: existing.total,
        notes: existing.notes ?? "",
      });
    }
  }, [existing, reset]);

  const onSubmit = async (values: PropertyFormValues) => {
    const input = toPropertyInput(values);
    if (isEdit) {
      update.mutate(input);
      return;
    }
    // Create, then upload any staged images to the new property's id.
    try {
      const property = await create.mutateAsync(input);
      if (staged.length > 0) {
        setUploading(true);
        const { failed } = await uploadImages(property.id, staged);
        if (failed > 0) toast.error(t("properties.images.someFailed", { count: failed }));
      }
      void navigate("/properties");
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {isEdit ? t("properties.editTitle") : t("properties.newTitle")}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <Section icon={<Home className="size-4" />} title={t("properties.formSecDetails")}>
          {field("city", "properties.city")}
          {field("address", "properties.address")}
          {field("ownerName", "properties.ownerName")}
          {field("ownerPhone", "properties.ownerPhone")}
          {field("entryCode", "properties.entryCode")}
          {field("electricMeter", "properties.electricMeter")}
          {field("waterMeter", "properties.waterMeter")}
        </Section>

        <Section icon={<Wallet className="size-4" />} title={t("properties.formSecFinances")}>
          {field("monthlyRent", "properties.rent", "number")}
          {field("maxCapacity", "properties.maxCapacity", "number")}
          {field("total", "properties.total", "number")}
          {field("contractStart", "properties.contractStart", "date")}
          {field("contractEnd", "properties.contractEnd", "date")}
          {/* Optional number: setValueAs maps an empty input to undefined (not NaN). */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="advanceNoticeDays">{t("properties.advanceNotice")}</Label>
            <Input
              id="advanceNoticeDays"
              type="number"
              aria-invalid={!!errors.advanceNoticeDays}
              {...register("advanceNoticeDays", {
                setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
              })}
            />
            {errors.advanceNoticeDays && (
              <p className="text-destructive text-sm">
                {t(errors.advanceNoticeDays?.message ?? "")}
              </p>
            )}
          </div>
        </Section>

        {/* Image uploads live on a saved property (needs an id), so the live
            uploader is active in edit mode; when creating, images are staged in
            the browser and uploaded right after the property is saved. */}
        {id !== undefined ? (
          <PropertyImages propertyId={id} canWrite={canWrite} />
        ) : (
          <PropertyImageDraft staged={staged} onChange={setStaged} canWrite={canWrite} />
        )}

        <Section
          icon={<StickyNote className="size-4" />}
          title={t("properties.formSecNotes")}
          bodyClassName="grid-cols-1"
        >
          {field("notes", "properties.notes")}
        </Section>

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
    </div>
  );
}
