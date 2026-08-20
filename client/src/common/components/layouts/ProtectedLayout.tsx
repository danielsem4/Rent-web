import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Building2, Users, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useInitAuth } from "@/hooks/common/useInitAuth";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import type { Role } from "@/common/types/role";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** If set, only these roles see the item (UX only — server enforces access). */
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  {
    to: "/properties",
    labelKey: "nav.properties",
    icon: Building2,
    roles: [ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER],
  },
  {
    to: "/employees",
    labelKey: "nav.employees",
    icon: Users,
    roles: [ROLES.COMPANY_MANAGER],
  },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

export default function ProtectedLayout() {
  const { t, i18n } = useTranslation();
  const { isLoading, isAuthenticated } = useInitAuth();
  const role = useAuthStore((s) => s.user?.role);
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
  const items = NAV_ITEMS.filter(
    (item) => !item.roles || (role != null && item.roles.includes(role)),
  );

  return (
    <SidebarProvider>
      <Sidebar side={side}>
        <SidebarHeader>
          <div className="px-2 py-1 text-xl font-semibold">rent+</div>
        </SidebarHeader>
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
                        className="gap-3 text-base [&>svg]:size-5"
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
