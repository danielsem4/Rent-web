import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { propertyApi } from "@/api/propertyApi";
import type { PropertyInput } from "@/api/propertyApi";

export function useCreateProperty() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (input: PropertyInput) => propertyApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success(t("properties.created"));
    },
    onError: () => toast.error(t("properties.saveFailed")),
  });
}
