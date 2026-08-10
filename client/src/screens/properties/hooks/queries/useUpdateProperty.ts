import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { propertyApi } from "@/api/propertyApi";
import type { PropertyInput } from "@/api/propertyApi";

interface UpdateVars {
  id: number;
  input: Partial<PropertyInput>;
}

export function useUpdateProperty() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) => propertyApi.update(id, input),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      void queryClient.invalidateQueries({ queryKey: ["properties", id] });
      toast.success(t("properties.updated"));
    },
    onError: () => toast.error(t("properties.saveFailed")),
  });
}
