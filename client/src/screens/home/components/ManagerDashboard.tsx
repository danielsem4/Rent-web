import { useTranslation } from "react-i18next";
import {
  Users,
  Building2,
  AlertTriangle,
  FileClock,
  CalendarClock,
} from "lucide-react";
import { useUsers } from "@/hooks/queries/useUsers";
import { useProperties } from "@/screens/properties/hooks/queries/useProperties";
import KpiCard from "./KpiCard";
import OutstandingPaymentsTable from "./OutstandingPaymentsTable";

/**
 * The manager's home screen. Active Employees + Apartments show live counts and
 * link to their screens; Outstanding Payments is surfaced as a full table below
 * the grid. The remaining three domains (Urgent Tasks, Expiring Documents,
 * Pending Reservations) are still "coming soon" placeholders until their own
 * backends are built — each will graduate into an inline table like Payments.
 */
export default function ManagerDashboard() {
  const { t } = useTranslation();
  const users = useUsers();
  const properties = useProperties();

  const activeEmployees = users.data?.filter((u) => u.isActive).length;
  const apartments = properties.data?.length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title={t("dashboard.activeEmployees")}
          icon={Users}
          value={activeEmployees}
          to="/employees"
          loading={users.isLoading}
          error={users.isError}
          errorLabel={t("dashboard.loadFailed")}
        />
        <KpiCard
          title={t("dashboard.apartments")}
          icon={Building2}
          value={apartments}
          to="/properties"
          loading={properties.isLoading}
          error={properties.isError}
          errorLabel={t("dashboard.loadFailed")}
        />
        <KpiCard
          title={t("dashboard.urgentTasks")}
          icon={AlertTriangle}
          comingSoon
          comingSoonLabel={t("dashboard.comingSoon")}
        />
        <KpiCard
          title={t("dashboard.expiringDocuments")}
          icon={FileClock}
          comingSoon
          comingSoonLabel={t("dashboard.comingSoon")}
        />
        <KpiCard
          title={t("dashboard.pendingReservations")}
          icon={CalendarClock}
          comingSoon
          comingSoonLabel={t("dashboard.comingSoon")}
        />
      </div>

      <OutstandingPaymentsTable />
    </div>
  );
}
