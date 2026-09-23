import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import ManagerDashboard from "./components/ManagerDashboard";
import WorkerDashboard from "./components/WorkerDashboard";

export default function Home() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  // Managers and workers each land on a role-scoped KPI dashboard; every other
  // role (e.g. RENTER) keeps the plain welcome view.
  if (user?.role === ROLES.COMPANY_MANAGER) {
    return <ManagerDashboard />;
  }
  if (user?.role === ROLES.COMPANY_WORKER) {
    return <WorkerDashboard />;
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
      <p className="text-muted-foreground">
        {t("home.welcome", { name: user?.name ?? "" })}
      </p>
    </div>
  );
}
