import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authApi } from "@/api/authApi";
import { useMfaStore } from "@/store/useMfaStore";

/**
 * Re-send the emailed 2FA code. The server issues a fresh code + a new mfaToken;
 * we swap the stored token so the challenge screen keeps working with the new code.
 */
export function useMfaResend() {
  const { t } = useTranslation();
  const mfaToken = useMfaStore((s) => s.mfaToken);
  const setChallenge = useMfaStore((s) => s.setChallenge);

  return useMutation({
    mutationFn: () => {
      if (!mfaToken) throw new Error("Missing MFA token");
      return authApi.mfaResend(mfaToken);
    },
    onSuccess: (newToken) => {
      setChallenge(newToken);
      toast.success(t("mfa.resent"));
    },
  });
}
