import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { propertyEquipmentApi } from "@/api/propertyEquipmentApi";
import type { IPropertyEquipmentInput } from "@/common/types/propertyEquipment";
import { propertyGroupKey } from "./usePropertyGroups";

export function usePropertyEquipment(propertyId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: propertyGroupKey(propertyId, "equipment"),
    queryFn: () => propertyEquipmentApi.list(propertyId as number),
    enabled: propertyId !== undefined && enabled,
  });
}

export function useCreateEquipment(propertyId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: IPropertyEquipmentInput) => propertyEquipmentApi.create(propertyId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyGroupKey(propertyId, "equipment") });
      toast.success(t("properties.itemAdded"));
    },
    onError: () => toast.error(t("properties.addFailed")),
  });
}

export function useDeleteEquipment(propertyId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => propertyEquipmentApi.remove(propertyId, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyGroupKey(propertyId, "equipment") });
      toast.success(t("properties.itemRemoved"));
    },
    onError: () => toast.error(t("properties.removeFailed")),
  });
}
