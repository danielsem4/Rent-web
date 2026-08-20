import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import type { Role } from "@/common/types/role";

/**
 * Role-aware guard, nested INSIDE ProtectedLayout so authentication is already
 * established. Renders the child routes only when the in-memory user's role is in
 * `roles`; otherwise sends the user to the Forbidden (403) screen. A missing user
 * (defensive — should be caught by ProtectedLayout first) falls back to /login.
 *
 * Mirrors the server's per-route authorization, but is UX only — the server (403 /
 * cookie auth) remains the real access boundary (SECURITY_PRINCIPLES.md).
 */
export default function RoleProtectedLayout({ roles }: { roles: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
