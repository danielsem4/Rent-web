import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/api/authApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useMfaStore } from "@/store/useMfaStore";
import { homePathForRole } from "@/lib/homePath";
import type { LoginFormValues } from "../../schema/loginSchema";

export function useLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const setChallenge = useMfaStore((s) => s.setChallenge);

  return useMutation({
    mutationFn: (values: LoginFormValues) =>
      authApi.login(values.email, values.password),
    onSuccess: (result) => {
      if (result.status === "mfa") {
        // Credentials OK, but login is not complete: no session cookies yet.
        // A code was emailed — hand the mfaToken to the challenge screen.
        setChallenge(result.mfaToken);
        void navigate("/login/mfa");
        return;
      }
      setUser(result.user);
      queryClient.setQueryData(["auth", "me"], result.user);
      void navigate(homePathForRole(result.user.role), { replace: true });
    },
  });
}
