import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import type { ModuleKey } from "@/common/types/module";

/**
 * Feature-module guard, nested INSIDE the role guards so authentication + role are
 * already established. Renders the child routes only when the user's company is
 * entitled to `module`; otherwise sends the user to the Forbidden (403) screen.
 *
 * Mirrors the server's requireModule, but is UX only — the server (403) remains
 * the real access boundary (SECURITY_PRINCIPLES.md).
 */
export default function ModuleProtectedLayout({ module }: { module: ModuleKey }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!user.enabledModules.includes(module)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
