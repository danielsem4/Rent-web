import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  ArrowLeft,
  LayoutGrid,
  Receipt,
  Package,
  Banknote,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperty } from "./hooks/queries/useProperties";
import { PropertyHeader } from "./components/PropertyHeader";
import { OverviewPanel } from "./components/overview/OverviewPanel";
import { BillsPanel } from "./components/bills/BillsPanel";
import { EquipmentPanel } from "./components/equipment/EquipmentPanel";
import { FinancesPanel } from "./components/finances/FinancesPanel";
import { InspectionsPanel } from "./components/inspections/InspectionsPanel";

const TABS = [
  { value: "overview", labelKey: "properties.tabs.overview", icon: LayoutGrid },
  { value: "bills", labelKey: "properties.tabs.bills", icon: Receipt },
  { value: "equipment", labelKey: "properties.tabs.equipment", icon: Package },
  { value: "finances", labelKey: "properties.tabs.finances", icon: Banknote },
  { value: "inspections", labelKey: "properties.tabs.inspections", icon: ClipboardCheck },
] as const;

export default function PropertyDetail() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const { data: property, isLoading, isError } = useProperty(id);
  // UX-only gating — the server is the enforcement point.
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Breadcrumb */}
      <nav
        aria-label="breadcrumb"
        className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
      >
        <Link to="/properties" className="hover:text-foreground transition-colors">
          {t("properties.title")}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground font-medium">{property.address}</span>
      </nav>

      <PropertyHeader property={property} canWrite={canWrite} />

      {/* dir keeps arrow-key tab navigation aligned with reading order in RTL. */}
      <Tabs defaultValue="overview" dir={i18n.dir()}>
        <TabsList>
          {TABS.map(({ value, labelKey, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="size-4" aria-hidden />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewPanel property={property} />
        </TabsContent>
        <TabsContent value="bills">
          <BillsPanel propertyId={property.id} />
        </TabsContent>
        <TabsContent value="equipment">
          <EquipmentPanel propertyId={property.id} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="finances">
          <FinancesPanel propertyId={property.id} />
        </TabsContent>
        <TabsContent value="inspections">
          <InspectionsPanel propertyId={property.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
