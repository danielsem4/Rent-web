import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { homePathForRole } from "@/lib/homePath";

/**
 * 403 screen shown when an authenticated user reaches a route their role can't
 * access (redirect target of RoleProtectedLayout). The "go home" link routes
 * through homePathForRole so it lands the user on their own home once per-role
 * homes exist; falls back to /login if there is no user in memory.
 */
export default function Forbidden() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const home = role ? homePathForRole(role) : "/login";

  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold">403</h1>
      <p className="text-muted-foreground">{t("forbidden.title")}</p>
      <Button asChild>
        <Link to={home}>{t("forbidden.back")}</Link>
      </Button>
    </div>
  );
}
