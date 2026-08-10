import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { companyApi } from "@/api/companyApi";
import type { CompanyInput } from "@/api/companyApi";

export function useCreateCompany() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (input: CompanyInput) => companyApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(t("companies.created"));
    },
    onError: () => toast.error(t("companies.saveFailed")),
  });
}
