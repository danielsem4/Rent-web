import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { propertyApi } from "@/api/propertyApi";

export function useDeleteProperty() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: number) => propertyApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success(t("properties.deleted"));
    },
    onError: () => toast.error(t("properties.deleteFailed")),
  });
}
