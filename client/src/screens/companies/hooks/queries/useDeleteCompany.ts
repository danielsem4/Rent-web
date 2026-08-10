import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { companyApi } from "@/api/companyApi";

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: number) => companyApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(t("companies.deleted"));
    },
    onError: () => toast.error(t("companies.deleteFailed")),
  });
}
