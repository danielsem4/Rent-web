import { useTranslation } from "react-i18next";
import { ClipboardCheck } from "lucide-react";
import { Field } from "@/common/components/detail/Field";
import { Section } from "@/common/components/detail/Section";
import { AsyncPanel } from "@/common/components/detail/AsyncPanel";
import { SectionPlaceholder } from "@/common/components/detail/SectionPlaceholder";
import { Card, CardContent } from "@/components/ui/card";
import { GROUP_READY } from "../../lib/dataGroups";
import { usePropertyInspections } from "../../hooks/queries/usePropertyGroups";

/** Periodic inspection tracking: last / next dates + notes. */
export function InspectionsPanel({ propertyId }: { propertyId: number }) {
  const { t, i18n } = useTranslation();
  const ready = GROUP_READY.inspections;
  const { data, isLoading, isError } = usePropertyInspections(propertyId, ready);

  if (!ready) {
    return (
      <SectionPlaceholder
        icon={ClipboardCheck}
        title={t("properties.sectionInspections")}
        message={t("properties.comingSoon")}
      />
    );
  }

  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(i18n.language) : "—");
  const rows = data ?? [];

  return (
    <AsyncPanel isLoading={isLoading} isError={isError}>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            {t("properties.inspectionsEmpty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {rows.map((ins) => (
            <Section
              key={ins.id}
              icon={<ClipboardCheck className="size-4" />}
              title={fmtDate(ins.nextInspectionDate)}
            >
              <Field label={t("properties.lastInspection")} value={fmtDate(ins.lastInspectionDate)} />
              <Field label={t("properties.nextInspection")} value={fmtDate(ins.nextInspectionDate)} />
              <div className="sm:col-span-2">
                <Field label={t("properties.inspectionNotes")} value={ins.notes} />
              </div>
            </Section>
          ))}
        </div>
      )}
    </AsyncPanel>
  );
}
