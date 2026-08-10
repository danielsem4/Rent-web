import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, Building2, ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useLogout } from "@/hooks/common/useLogout";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Admin User" → "AU", "admin" → "A". */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const chars = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts[parts.length - 1][0]];
  return chars.join("").toUpperCase();
}

export default function AppSidebar() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { isMobile } = useSidebar();
  const user = useAuthStore((s) => s.user);
  const handleLogout = useLogout();

  const side = i18n.dir() === "rtl" ? "right" : "left";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const homePath = isSuperAdmin ? "/companies" : "/";

  return (
    <Sidebar collapsible="icon" side={side}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link to={homePath}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Building2 className="size-4" />
                </div>
                <span className="text-base font-semibold">rent+</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {!isSuperAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  tooltip={t("properties.title")}
                >
                  <Link to="/">
                    <Building2 />
                    <span>{t("properties.title")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {isSuperAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/companies")}
                  tooltip={t("companies.title")}
                >
                  <Link to="/companies">
                    <Briefcase />
                    <span>{t("companies.title")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith("/settings")}
                tooltip={t("settings.title")}
              >
                <Link to="/settings">
                  <Settings />
                  <span>{t("settings.title")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {initials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-start text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {user.email}
                      </span>
                    </div>
                    <ChevronsUpDown className="ms-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side={isMobile ? "bottom" : side === "left" ? "right" : "left"}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut />
                    {t("common.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
