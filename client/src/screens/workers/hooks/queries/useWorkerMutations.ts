import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { workersApi } from "@/api/workersApi";
import type { IWorkerInput } from "@/common/types/worker";
import { workersKey } from "./useWorkers";

export function useCreateWorker() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: IWorkerInput) => workersApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workersKey });
      toast.success(t("workers.created"));
      void navigate("/workers");
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
      toast.success(t("workers.deleted"));
    },
    onError: () => toast.error(t("workers.deleteFailed")),
  });
}
