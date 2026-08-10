import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyQuery } from "./hooks/queries/useCompanyQuery";

function DetailRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? t("companies.noManager")}</span>
    </div>
  );
}

function ComingSoon() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="text-muted-foreground text-sm">{t("companies.tabComingSoon")}</p>
    </div>
  );
}

export default function CompanyDetails() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const query = useCompanyQuery(Number(id));

  // UI-only gate; the API enforces SUPER_ADMIN independently.
  if (role !== "SUPER_ADMIN") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => void navigate("/companies")}
      >
        <ArrowLeft className="size-4" />
        {t("companies.detailsBack")}
      </Button>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : query.isError || !query.data ? (
        <p className="text-destructive">{t("companies.loadError")}</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{query.data.name}</h1>
          </div>

          <Tabs defaultValue="general">
            <TabsList className="flex-wrap">
              <TabsTrigger value="general">{t("companies.tabGeneral")}</TabsTrigger>
              <TabsTrigger value="logs">{t("companies.tabLogs")}</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-4">
              <Card className="md:max-w-md">
                <CardHeader>
                  <CardTitle className="text-base">{t("companies.sectionGeneral")}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  <DetailRow label={t("companies.fName")} value={query.data.name} />
                  <DetailRow
                    label={t("companies.colManager")}
                    value={query.data.manager ? `${query.data.manager.name} (${query.data.manager.email})` : null}
                  />
                  <DetailRow
                    label={t("companies.colCreated")}
                    value={new Date(query.data.createdAt).toLocaleDateString()}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            {/* Audit logs land in their own slice. */}
            <TabsContent value="logs" className="mt-4">
              <ComingSoon />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
