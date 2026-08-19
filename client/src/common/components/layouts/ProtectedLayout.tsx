import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInitAuth } from "@/hooks/common/useInitAuth";
import { useAuthStore } from "@/store/useAuthStore";
import { authApi } from "@/api/authApi";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/common/components/ThemeToggle";

export default function ProtectedLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useInitAuth();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await authApi.logout().catch(() => undefined);
    logout();
    void navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-svh">
      {/* Sidebar shell — replace with a full shadcn <Sidebar/> as the app grows */}
      <aside className="hidden w-60 shrink-0 flex-col border-e bg-sidebar p-4 md:flex">
        <div className="mb-6 text-lg font-semibold">rent+</div>
        <nav className="flex flex-col gap-1 text-sm">
          <a href="/" className="rounded-md px-3 py-2 hover:bg-sidebar-accent">
            {t("home.title")}
          </a>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b px-6">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={handleLogout}>
            {t("common.logout")}
          </Button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
