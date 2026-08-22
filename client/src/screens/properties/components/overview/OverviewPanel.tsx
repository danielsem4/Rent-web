import { useTranslation } from "react-i18next";
import { Home, UserRound, KeyRound, CalendarDays } from "lucide-react";
import { Field } from "@/common/components/detail/Field";
import { Section } from "@/common/components/detail/Section";
import type { IProperty } from "@/common/types/property";

/**
 * The default tab: apartment profile plus owner, access & utilities, and
 * contract details. Absorbs the sections from the pre-redesign detail screen.
 */
export function OverviewPanel({ property }: { property: IProperty }) {
  const { t, i18n } = useTranslation();
  const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString(i18n.language) : "—";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section icon={<Home className="size-4" />} title={t("properties.sectionProfile")}>
        <Field label={t("properties.rooms")} value={property.rooms ?? "—"} />
        <Field
          label={t("properties.occupancy")}
          value={`${property.total} / ${property.maxCapacity}`}
        />
      </Section>

      <Section icon={<UserRound className="size-4" />} title={t("properties.sectionOwner")}>
        <Field label={t("properties.ownerName")} value={property.ownerName} />
        <Field label={t("properties.ownerPhone")} value={property.ownerPhone} />
      </Section>

      <Section icon={<KeyRound className="size-4" />} title={t("properties.sectionAccess")}>
        <Field label={t("properties.entryCode")} value={property.entryCode} />
        <Field label={t("properties.electricMeter")} value={property.electricMeter} />
        <Field label={t("properties.waterMeter")} value={property.waterMeter} />
      </Section>

      <Section icon={<CalendarDays className="size-4" />} title={t("properties.sectionContract")}>
        <Field label={t("properties.contractStart")} value={formatDate(property.contractStart)} />
        <Field label={t("properties.contractEnd")} value={formatDate(property.contractEnd)} />
        <div className="sm:col-span-2">
          <Field label={t("properties.notes")} value={property.notes} />
        </div>
      </Section>
    </div>
  );
}
