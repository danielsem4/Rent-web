import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/api/authApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useMfaStore } from "@/store/useMfaStore";
import { homePathForRole } from "@/lib/homePath";

/**
 * Second-factor login: exchange the mfaToken + emailed code for a real session,
 * then land on the role's home. NOTE: we do NOT clear the mfaToken here — doing so
 * would re-trigger MfaChallenge's `!mfaToken` guard mid-transition and bounce the
 * user to /login. The token is single-use (already consumed server-side) and is
 * cleared safely when the screen unmounts.
 */
export function useMfaChallenge() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const mfaToken = useMfaStore((s) => s.mfaToken);

  return useMutation({
    mutationFn: (code: string) => {
      if (!mfaToken) throw new Error("Missing MFA token");
      return authApi.mfaChallenge(mfaToken, code);
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(["auth", "me"], user);
      void navigate(homePathForRole(user.role), { replace: true });
    },
  });
}
