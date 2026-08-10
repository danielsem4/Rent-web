import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authApi } from "@/api/authApi";
import type { ChangePasswordFormValues } from "../../schema/changePasswordSchema";

export function useChangePassword(onSuccess?: () => void) {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (values: ChangePasswordFormValues) =>
      authApi.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success(t("settings.passwordChanged"));
      onSuccess?.();
    },
    onError: () => {
      toast.error(t("settings.passwordFailed"));
    },
  });
}
