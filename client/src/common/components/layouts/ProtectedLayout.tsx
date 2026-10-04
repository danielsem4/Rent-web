import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Building2, Users, UsersRound, Settings, Building } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useInitAuth } from "@/hooks/common/useInitAuth";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import type { Role } from "@/common/types/role";
import { MODULE_KEYS } from "@/common/types/module";
import type { ModuleKey } from "@/common/types/module";
import SidebarLogout from "@/common/components/SidebarLogout";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** If set, only these roles see the item (UX only — server enforces access). */
  roles?: Role[];
  /** If set, only companies entitled to this module see the item (UX only). */
  module?: ModuleKey;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  {
    to: "/properties",
    labelKey: "nav.properties",
    icon: Building2,
    roles: [ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER],
    module: MODULE_KEYS.CORE_RENT,
  },
  {
    to: "/workers",
    labelKey: "nav.workers",
    icon: UsersRound,
    roles: [ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER],
    module: MODULE_KEYS.FOREIGN_WORKERS,
  },
  {
    to: "/employees",
    labelKey: "nav.employees",
    icon: Users,
    roles: [ROLES.COMPANY_MANAGER],
  },
  {
    to: "/admin/companies",
    labelKey: "nav.companies",
    icon: Building,
    roles: [ROLES.SUPER_ADMIN],
  },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

export default function ProtectedLayout() {
  const { t, i18n } = useTranslation();
  const { isLoading, isAuthenticated } = useInitAuth();
  const role = useAuthStore((s) => s.user?.role);
  const enabledModules = useAuthStore((s) => s.user?.enabledModules);
  const userName = useAuthStore((s) => s.user?.name);
  const { pathname } = useLocation();

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

  // RTL locales (he/ar) put the sidebar on the inline-end (right) side.
  const side = i18n.dir() === "rtl" ? "right" : "left";
  const items = NAV_ITEMS.filter((item) => {
    const roleOk = !item.roles || (role != null && item.roles.includes(role));
    const moduleOk = !item.module || (enabledModules?.includes(item.module) ?? false);
    return roleOk && moduleOk;
  });

  return (
    <SidebarProvider>
      <Sidebar side={side}>
        <SidebarHeader>
          <div className="px-2 py-1.5">
            <p className="truncate text-base font-semibold">
              {t("common.welcome", { name: userName ?? "" })}
            </p>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const isActive =
                    item.to === "/"
                      ? pathname === "/"
                      : pathname === item.to ||
                        pathname.startsWith(`${item.to}/`);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        size="lg"
                        isActive={isActive}
                        tooltip={t(item.labelKey)}
                        className="gap-3 text-base [&>svg]:size-5 hover:bg-foreground/5 hover:text-foreground data-[active=true]:bg-card data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:shadow-card"
                      >
                        <NavLink to={item.to} end={item.to === "/"}>
                          <Icon />
                          <span>{t(item.labelKey)}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarLogout />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
