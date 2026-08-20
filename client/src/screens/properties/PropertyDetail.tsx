import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperty } from "./hooks/queries/useProperties";

/** A single label/value pair in the detail grid. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      <span className="break-words">{value ?? "—"}</span>
    </div>
  );
}

export default function PropertyDetail() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const { data: property, isLoading, isError } = useProperty(id);
  // UX-only gating — the server is the enforcement point.
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;

  const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString(i18n.language) : "—";

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10">
        <Loader2 className="size-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (isError || !property) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <p className="text-destructive">{t("properties.loadFailed")}</p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/properties">
            <ArrowLeft className="size-4" />
            {t("properties.back")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/properties">
            <ArrowLeft className="size-4" />
            {t("properties.back")}
          </Link>
        </Button>
        {canWrite && (
          <Button asChild size="sm">
            <Link to={`/properties/${property.id}/edit`}>
              <Pencil className="size-4" />
              {t("properties.edit")}
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {property.city}, {property.address}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("properties.city")} value={property.city} />
          <Field label={t("properties.address")} value={property.address} />
          <Field label={t("properties.ownerName")} value={property.ownerName} />
          <Field label={t("properties.ownerPhone")} value={property.ownerPhone} />
          <Field
            label={t("properties.rent")}
            value={property.monthlyRent.toLocaleString()}
          />
          <Field label={t("properties.capacity")} value={property.capacity} />
          <Field label={t("properties.entryCode")} value={property.entryCode} />
          <Field label={t("properties.electricMeter")} value={property.electricMeter} />
          <Field label={t("properties.waterMeter")} value={property.waterMeter} />
          <Field
            label={t("properties.contractStart")}
            value={formatDate(property.contractStart)}
          />
          <Field
            label={t("properties.contractEnd")}
            value={formatDate(property.contractEnd)}
          />
          <div className="sm:col-span-2">
            <Field label={t("properties.notes")} value={property.notes} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
