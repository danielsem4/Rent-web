import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { homePathForRole } from "@/lib/homePath";

/**
 * Inverse of ProtectedLayout: keeps already-authenticated users off the login /
 * MFA screens. Reads the in-memory `user` (memory-only, cleared on logout) rather
 * than the persisted `userId`, so a stale persisted id can't bounce a genuine
 * guest. Server cookies remain the real access boundary — this is UX only.
 */
export default function GuestOnlyLayout() {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={homePathForRole(user.role)} replace />;
  return <Outlet />;
}
