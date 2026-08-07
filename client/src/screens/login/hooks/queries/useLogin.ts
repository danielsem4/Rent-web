import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/api/authApi";
import { useAuthStore } from "@/store/useAuthStore";
import type { LoginFormValues } from "../../schema/loginSchema";

export function useLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (values: LoginFormValues) =>
      authApi.login(values.email, values.password),
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(["auth", "me"], user);
      void navigate("/home");
    },
  });
}
