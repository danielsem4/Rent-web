import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePropertyQuery } from "./hooks/queries/usePropertyQuery";
import { formatDate } from "./lib/indicators";
import type { IProperty } from "@/common/types/property";

function DetailRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? t("properties.notProvided")}</span>
    </div>
  );
}

function GeneralTab({ property }: { property: IProperty }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("properties.sectionGeneral")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <DetailRow label={t("properties.fCity")} value={property.city} />
          <DetailRow label={t("properties.fAddress")} value={property.address} />
          <DetailRow label={t("properties.fEntryCode")} value={property.entryCode} />
          <DetailRow label={t("properties.fElectricMeter")} value={property.electricMeter} />
          <DetailRow label={t("properties.fWaterMeter")} value={property.waterMeter} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("properties.sectionOwner")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <DetailRow label={t("properties.fOwnerName")} value={property.ownerName} />
          <DetailRow label={t("properties.fOwnerPhone")} value={property.ownerPhone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("properties.sectionContract")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <DetailRow label={t("properties.fContractStart")} value={formatDate(property.contractStart)} />
          <DetailRow label={t("properties.fContractEnd")} value={formatDate(property.contractEnd)} />
          <DetailRow label={t("properties.fMonthlyRent")} value={property.monthlyRent.toLocaleString()} />
          <DetailRow label={t("properties.fCapacity")} value={String(property.capacity)} />
          <DetailRow label={t("properties.fNotes")} value={property.notes} />
        </CardContent>
      </Card>
    </div>
  );
}

function ComingSoon() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="text-muted-foreground text-sm">{t("properties.tabComingSoon")}</p>
    </div>
  );
}

export default function PropertyDetails() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const query = usePropertyQuery(Number(id));

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => void navigate("/")}
      >
        <ArrowLeft className="size-4" />
        {t("properties.detailsBack")}
      </Button>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : query.isError || !query.data ? (
        <p className="text-destructive">{t("properties.loadError")}</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{query.data.address}</h1>
            <p className="text-muted-foreground text-sm">{query.data.city}</p>
          </div>

          <Tabs defaultValue="general">
            <TabsList className="flex-wrap">
              <TabsTrigger value="general">{t("properties.tabGeneral")}</TabsTrigger>
              <TabsTrigger value="tenants">{t("properties.tabTenants")}</TabsTrigger>
              <TabsTrigger value="ledger">{t("properties.tabLedger")}</TabsTrigger>
              <TabsTrigger value="tickets">{t("properties.tabTickets")}</TabsTrigger>
              <TabsTrigger value="export">{t("properties.tabExport")}</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-4">
              <GeneralTab property={query.data} />
            </TabsContent>
            {/* Tenants / Ledger / Tickets / Export land in their own slices. */}
            <TabsContent value="tenants" className="mt-4">
              <ComingSoon />
            </TabsContent>
            <TabsContent value="ledger" className="mt-4">
              <ComingSoon />
            </TabsContent>
            <TabsContent value="tickets" className="mt-4">
              <ComingSoon />
            </TabsContent>
            <TabsContent value="export" className="mt-4">
              <ComingSoon />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
