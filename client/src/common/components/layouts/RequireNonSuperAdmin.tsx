import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Guards routes that super admins must not reach (e.g. Properties).
 * Super admins are redirected to their landing screen (Companies);
 * everyone else renders the nested route.
 */
export default function RequireNonSuperAdmin() {
  const user = useAuthStore((s) => s.user);

  if (user?.role === "SUPER_ADMIN") {
    return <Navigate to="/companies" replace />;
  }

  return <Outlet />;
}
