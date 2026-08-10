import { useNavigate } from "react-router-dom";
import { authApi } from "@/api/authApi";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Logs the user out: clears the server session, resets the auth store,
 * and redirects to /login. Server errors are swallowed so the client
 * state is always cleared.
 */
export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  return async () => {
    await authApi.logout().catch(() => undefined);
    logout();
    void navigate("/login");
  };
}
