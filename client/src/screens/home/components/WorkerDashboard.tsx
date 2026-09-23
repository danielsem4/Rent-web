import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Building2, HardHat, CircleDollarSign, ClipboardCheck } from "lucide-react";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { useWorkers } from "@/screens/workers/hooks/queries/useWorkers";
import { usePayments } from "@/hooks/queries/usePayments";
import { useInspections } from "@/hooks/queries/useInspections";
import { expiryStatus } from "@/screens/workers/lib/expiry";
import KpiCard from "./KpiCard";
import ExpiringDocumentsTable from "./ExpiringDocumentsTable";
import EndingContractsTable from "./EndingContractsTable";

/** Wraps a child in a staggered fade/slide-in entrance (reduced-motion safe via
 *  the global media query in index.css). `index` drives the delay. */
function Reveal({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div
      className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * The company worker's home screen. A worker is read-only staff, so this mirrors
 * the manager dashboard minus anything employee/user related (workers get 403 on
 * /api/users). Apartments + Foreign Workers show live counts and link to their
 * screens; Overdue Payments and Upcoming Inspections surface attention counts.
 * Below, two attention tables list workers whose visa/passport is expired or
 * expiring within 30 days and properties whose contract has ended/ends within 60.
 */
export default function WorkerDashboard() {
  const { t } = useTranslation();
  const properties = useProperties();
  const workers = useWorkers();
  const payments = usePayments();
  const inspections = useInspections();

  const apartments = properties.data?.length;
  const foreignWorkers = workers.data?.length;

  // Outstanding = still PENDING with a due date already in the past ("expired").
  const overduePayments = payments.data?.filter(
    (p) => p.status === "PENDING" && expiryStatus(p.dueDate)?.severity === "expired",
  ).length;
  // Due soon = a next-inspection date that is already past or within 30 days.
  const upcomingInspections = inspections.data?.filter((i) => {
    const status = expiryStatus(i.nextInspectionDate);
    return status !== null && status.days <= 30;
  }).length;

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal index={0}>
          <KpiCard
            title={t("dashboard.apartments")}
            icon={Building2}
            accent="success"
            value={apartments}
            to="/properties"
            loading={properties.isLoading}
            error={properties.isError}
            errorLabel={t("dashboard.loadFailed")}
          />
        </Reveal>
        <Reveal index={1}>
          <KpiCard
            title={t("dashboard.foreignWorkers")}
            icon={HardHat}
            accent="warning"
            value={foreignWorkers}
            to="/workers"
            loading={workers.isLoading}
            error={workers.isError}
            errorLabel={t("dashboard.loadFailed")}
          />
        </Reveal>
        <Reveal index={2}>
          <KpiCard
            title={t("dashboard.outstandingPayments")}
            icon={CircleDollarSign}
            accent="danger"
            value={overduePayments}
            loading={payments.isLoading}
            error={payments.isError}
            errorLabel={t("dashboard.loadFailed")}
          />
        </Reveal>
        <Reveal index={3}>
          <KpiCard
            title={t("dashboard.upcomingInspections")}
            icon={ClipboardCheck}
            accent="info"
            value={upcomingInspections}
            to="/properties"
            loading={inspections.isLoading}
            error={inspections.isError}
            errorLabel={t("dashboard.loadFailed")}
          />
        </Reveal>
      </div>

      <Reveal index={4}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExpiringDocumentsTable />
          <EndingContractsTable />
        </div>
      </Reveal>
    </div>
  );
}
