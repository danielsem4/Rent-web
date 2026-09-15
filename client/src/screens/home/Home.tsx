import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import ManagerDashboard from "./components/ManagerDashboard";

export default function Home() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  // Managers land on the KPI dashboard; every other role keeps the welcome view.
  if (user?.role === ROLES.COMPANY_MANAGER) {
    return <ManagerDashboard />;
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
