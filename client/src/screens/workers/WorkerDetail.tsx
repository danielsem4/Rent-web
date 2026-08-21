import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Pencil,
  ArrowLeft,
  UserRound,
  FileText,
  ShieldPlus,
  Phone,
  LayoutGrid,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { useWorker } from "./hooks/queries/useWorkers";
import { ExpiryBadge } from "./components/ExpiryBadge";
import WorkerDocuments from "./components/WorkerDocuments";
import { documentHealth, yearsSince, type DocumentHealth } from "./lib/expiry";

/** A single label/value pair inside a section grid. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      <span className="break-words">{value ?? "—"}</span>
    </div>
  );
}

/** A titled section card grouping related fields. */
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

/** An expiry date paired with its alert badge. */
function ExpiryField({ label, dateISO }: { label: string; dateISO: string | null | undefined }) {
  const { i18n } = useTranslation();
  const formatted = dateISO ? new Date(dateISO).toLocaleDateString(i18n.language) : "—";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span>{formatted}</span>
        <ExpiryBadge dateISO={dateISO} showOk />
      </span>
    </div>
  );
}

/** Circular monogram from the worker's name. */
function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0) || "?";
  return (
    <div
      className="bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
      aria-hidden
    >
      {initial}
    </div>
  );
}

// Header status pill, derived from the worst document expiry. Reuses the shared
// status tokens so it reads as one system with the ExpiryBadge chips.
const HEALTH_BADGE: Record<DocumentHealth, { key: string; cls: string; Icon: LucideIcon }> = {
  expired: { key: "workers.statusExpired", cls: "bg-danger-bg text-danger", Icon: AlertTriangle },
  expiring: {
    key: "workers.statusExpiring",
    cls: "bg-warning-bg text-warning",
    Icon: CalendarClock,
  },
  ok: { key: "workers.statusValid", cls: "bg-success-bg text-success", Icon: CheckCircle2 },
};

function StatusBadge({ severity }: { severity: DocumentHealth }) {
  const { t } = useTranslation();
  const { key, cls, Icon } = HEALTH_BADGE[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(key)}
    </span>
  );
}

type TabKey = "overview" | "documents" | "insurance" | "contact";

const TABS: { key: TabKey; labelKey: string; icon: LucideIcon }[] = [
  { key: "overview", labelKey: "workers.tabs.overview", icon: LayoutGrid },
  { key: "documents", labelKey: "workers.tabs.documents", icon: FileText },
  { key: "insurance", labelKey: "workers.tabs.insurance", icon: ShieldPlus },
  { key: "contact", labelKey: "workers.tabs.contact", icon: Phone },
];

/** Segmented control that switches the panel below. RTL-safe (logical flow). */
function Tabs({
  tab,
  setTab,
  warningCount,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  warningCount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-muted flex gap-1 overflow-x-auto rounded-xl p-1">
      {TABS.map(({ key, labelKey, icon: Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/50 flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] sm:flex-1",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(labelKey)}
            {key === "documents" && warningCount > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                  "bg-danger-bg text-danger",
                )}
              >
                {warningCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Overview aside: a callout when documents need attention, else a quiet OK. */
function AttentionCard({ count, onView }: { count: number; onView: () => void }) {
  const { t } = useTranslation();
  if (count === 0) {
    return (
      <Card className="border-success/40 bg-success-bg/40">
        <CardContent className="flex items-center gap-3">
          <CheckCircle2 className="text-success size-5 shrink-0" aria-hidden />
          <span className="text-sm font-medium">{t("workers.allDocumentsValid")}</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-danger/40 bg-danger-bg/40">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-danger size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="text-danger font-semibold">{t("workers.attentionTitle")}</span>
            <span className="text-muted-foreground text-sm">
              {t("workers.attentionDesc", { count })}
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={onView}>
          {t("workers.viewDocuments")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Dark brand tile showing years of seniority since entry. */
function SeniorityTile({ years }: { years: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="bg-primary text-primary-foreground flex items-center justify-between gap-4 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="text-primary-foreground/70 text-sm">{t("workers.systemStatus")}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums">{years ?? "—"}</span>
          {years !== null && (
            <span className="text-primary-foreground/80 text-sm">{t("workers.seniorityUnit")}</span>
          )}
        </span>
        <span className="text-primary-foreground/70 text-xs">{t("workers.seniorityLabel")}</span>
      </div>
      <BarChart3 className="text-primary-foreground/40 size-8 shrink-0" aria-hidden />
    </div>
  );
}

export default function WorkerDetail() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const { data: worker, isLoading, isError } = useWorker(id);
  const { data: properties } = useProperties();
  // UX-only gating — the server is the enforcement point.
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;
  const [tab, setTab] = useState<TabKey>("overview");

  const apartmentProp = worker?.propertyId
    ? (properties ?? []).find((x) => x.id === worker.propertyId)
    : undefined;
  const apartment = apartmentProp ? `${apartmentProp.city}, ${apartmentProp.address}` : null;

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

  if (isError || !worker) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <p className="text-destructive">{t("workers.loadFailed")}</p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/workers">
            <ArrowLeft className="size-4" />
            {t("workers.back")}
          </Link>
        </Button>
      </div>
    );
  }

  const langLabel = worker.preferredLanguage
    ? t(`workers.languages.${worker.preferredLanguage}`)
    : "—";
  const health = documentHealth(worker);
  const years = yearsSince(worker.entryDate);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Breadcrumb */}
      <nav
        aria-label="breadcrumb"
        className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
      >
        <Link to="/workers" className="hover:text-foreground transition-colors">
          {t("nav.workers")}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground font-medium">{worker.nameHe}</span>
      </nav>

      {/* Hero header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={worker.nameHe || worker.nameEn} />
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">
                {worker.nameHe}
                {worker.nameEn && (
                  <span className="text-muted-foreground ms-2 text-lg font-normal">
                    {worker.nameEn}
                  </span>
                )}
              </h1>
              <StatusBadge severity={health.severity} />
            </div>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span>{worker.nationality}</span>
              {worker.entryDate && (
                <>
                  <span aria-hidden>·</span>
                  <span>{t("workers.enteredOn", { date: formatDate(worker.entryDate) })}</span>
                </>
              )}
            </p>
          </div>
        </div>
        {canWrite && (
          <Button asChild>
            <Link to={`/workers/${worker.id}/edit`}>
              <Pencil className="size-4" />
              {t("workers.edit")}
            </Link>
          </Button>
        )}
      </div>

      <Tabs tab={tab} setTab={setTab} warningCount={health.count} />

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section icon={<UserRound className="size-4" />} title={t("workers.sectionProfile")}>
            <Field label={t("workers.nationality")} value={worker.nationality} />
            <Field label={t("workers.entryDate")} value={formatDate(worker.entryDate)} />
            <Field label={t("workers.preferredLanguage")} value={langLabel} />
          </Section>
          <div className="flex flex-col gap-6">
            <AttentionCard count={health.count} onView={() => setTab("documents")} />
            <SeniorityTile years={years} />
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="flex flex-col gap-6">
          <Section icon={<FileText className="size-4" />} title={t("workers.sectionDocuments")}>
            <Field label={t("workers.passportNumber")} value={worker.passportNumber} />
            <ExpiryField label={t("workers.passportExpiry")} dateISO={worker.passportExpiry} />
            <Field label={t("workers.visaType")} value={worker.visaType} />
            <ExpiryField label={t("workers.visaExpiry")} dateISO={worker.visaExpiry} />
          </Section>
          <WorkerDocuments workerId={worker.id} canWrite={canWrite} />
        </div>
      )}

      {tab === "insurance" && (
        <Section icon={<ShieldPlus className="size-4" />} title={t("workers.sectionInsurance")}>
          <Field label={t("workers.insuranceProvider")} value={worker.insuranceProvider} />
          <Field label={t("workers.insurancePolicyNumber")} value={worker.insurancePolicyNumber} />
          <Field label={t("workers.insuranceCoverageType")} value={worker.insuranceCoverageType} />
          <ExpiryField label={t("workers.insuranceExpiry")} dateISO={worker.insuranceExpiry} />
        </Section>
      )}

      {tab === "contact" && (
        <Section icon={<Phone className="size-4" />} title={t("workers.sectionContact")}>
          <Field label={t("workers.phone")} value={worker.phone} />
          <Field label={t("workers.employer")} value={worker.employer} />
          <Field label={t("workers.apartment")} value={apartment} />
          <div className="sm:col-span-2">
            <Field label={t("workers.notes")} value={worker.notes} />
          </div>
        </Section>
      )}
    </div>
  );
}
