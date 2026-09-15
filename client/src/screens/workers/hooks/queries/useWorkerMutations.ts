import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { workersApi } from "@/api/workersApi";
import type { IWorkerInput } from "@/common/types/worker";
import { propertiesKey } from "@/screens/properties/hooks/queries/useProperties";
import { workersKey } from "./useWorkers";

// Navigation is intentionally NOT done here: the form awaits the created worker
// (mutateAsync), uploads any staged documents to its new id, then navigates.
export function useCreateWorker() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: IWorkerInput) => workersApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workersKey });
      toast.success(t("workers.created"));
    },
    onError: () => toast.error(t("workers.saveFailed")),
  });
}

export function useUpdateWorker(id: number) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: IWorkerInput) => workersApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workersKey });
      void qc.invalidateQueries({ queryKey: ["workers", id] });
      toast.success(t("workers.updated"));
      void navigate("/workers");
    },
    onError: () => toast.error(t("workers.saveFailed")),
  });
}

export function useDeleteWorker() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => workersApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workersKey });
      // Deleting an assigned worker changes the server-computed property
      // occupancy; refresh the properties list + every detail (prefix match).
      void qc.invalidateQueries({ queryKey: propertiesKey });
      toast.success(t("workers.deleted"));
    },
    onError: () => toast.error(t("workers.deleteFailed")),
  });
}
