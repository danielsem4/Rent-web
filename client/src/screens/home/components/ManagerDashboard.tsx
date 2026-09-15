import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Users, Building2, HardHat } from "lucide-react";
import { useUsers } from "@/hooks/queries/useUsers";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import { useWorkers } from "@/screens/workers/hooks/queries/useWorkers";
import KpiCard from "./KpiCard";
import ExpiringVisasTable from "./ExpiringVisasTable";
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
 * The manager's home screen. Active Employees, Apartments + Foreign Workers show
 * live counts and link to their screens; below them two attention tables surface
 * workers whose visa is expired/expiring within 30 days and properties whose
 * contract has ended/ends within 60 days.
 */
export default function ManagerDashboard() {
  const { t } = useTranslation();
  const users = useUsers();
  const properties = useProperties();
  const workers = useWorkers();

  const activeEmployees = users.data?.filter((u) => u.isActive).length;
  const apartments = properties.data?.length;
  const foreignWorkers = workers.data?.length;

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Reveal index={0}>
          <KpiCard
            title={t("dashboard.activeEmployees")}
            icon={Users}
            accent="info"
            value={activeEmployees}
            to="/employees"
            loading={users.isLoading}
            error={users.isError}
            errorLabel={t("dashboard.loadFailed")}
          />
        </Reveal>
        <Reveal index={1}>
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
        <Reveal index={2}>
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
      </div>

      <Reveal index={3}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExpiringVisasTable />
          <EndingContractsTable />
        </div>
      </Reveal>
    </div>
  );
}
