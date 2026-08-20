import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { propertiesApi } from "@/api/propertiesApi";
import type { IPropertyInput } from "@/common/types/property";
import { propertiesKey } from "./useProperties";

export function useCreateProperty() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: IPropertyInput) => propertiesApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertiesKey });
      toast.success(t("properties.created"));
      void navigate("/properties");
    },
    onError: () => toast.error(t("properties.saveFailed")),
  });
}

export function useUpdateProperty(id: number) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: IPropertyInput) => propertiesApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertiesKey });
      void qc.invalidateQueries({ queryKey: ["properties", id] });
      toast.success(t("properties.updated"));
      void navigate("/properties");
    },
    onError: () => toast.error(t("properties.saveFailed")),
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => propertiesApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertiesKey });
      toast.success(t("properties.deleted"));
    },
    onError: () => toast.error(t("properties.deleteFailed")),
  });
}
