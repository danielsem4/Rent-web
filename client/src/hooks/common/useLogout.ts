import { authApi } from "@/api/authApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useMfaStore } from "@/store/useMfaStore";

/**
 * Central logout. Best-effort server call (cookies are cleared server-side), then
 * a full-page reset to /login: `window.location.replace` drops the current history
 * entry and reloads, wiping the react-query cache and all SPA state. This is what
 * prevents Back from resurrecting protected content from a stale ["auth","me"] cache.
 */
export function useLogout() {
  return async () => {
    await authApi.logout().catch(() => undefined);
    useAuthStore.getState().logout();
    useMfaStore.getState().clear();
    window.location.replace("/login");
  };
}
