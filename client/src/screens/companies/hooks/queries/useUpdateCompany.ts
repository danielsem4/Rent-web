import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { companyApi } from "@/api/companyApi";
import type { CompanyInput } from "@/api/companyApi";

interface UpdateVars {
  id: number;
  input: Partial<CompanyInput>;
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) => companyApi.update(id, input),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: ["companies", id] });
      toast.success(t("companies.updated"));
    },
    onError: () => toast.error(t("companies.saveFailed")),
  });
}
