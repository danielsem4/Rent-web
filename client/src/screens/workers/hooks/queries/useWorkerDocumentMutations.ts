import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { workerDocumentsApi } from "@/api/workerDocumentsApi";
import type { WorkerDocumentType } from "@/common/types/workerDocument";
import { workerDocumentsKey } from "./useWorkerDocuments";

export function useUploadWorkerDocument(workerId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (vars: { file: File; docType: WorkerDocumentType }) =>
      workerDocumentsApi.upload(workerId, vars.file, vars.docType),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workerDocumentsKey(workerId) });
      toast.success(t("workers.documents.uploaded"));
    },
    onError: () => toast.error(t("workers.documents.uploadFailed")),
  });
}

export function useDeleteWorkerDocument(workerId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => workerDocumentsApi.remove(workerId, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workerDocumentsKey(workerId) });
      toast.success(t("workers.documents.deleted"));
    },
    onError: () => toast.error(t("workers.documents.deleteFailed")),
  });
}

/**
 * Download a document to the user's device. Not a react-query mutation (no cache
 * effect) — a thin helper that fetches the blob and triggers a save via file-saver.
 */
export function useDownloadWorkerDocument(workerId: number) {
  const { t } = useTranslation();
  return async (id: number, filename: string) => {
    try {
      const blob = await workerDocumentsApi.download(workerId, id);
      saveAs(blob, filename);
    } catch {
      toast.error(t("workers.documents.downloadFailed"));
    }
  };
}
