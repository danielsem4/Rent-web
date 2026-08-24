import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { workerDocumentsApi } from "@/api/workerDocumentsApi";
import type { WorkerDocumentType } from "@/common/types/workerDocument";
import type { StagedDocument } from "../../lib/documentUpload";
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
 * Batch-upload staged documents to a (just-created) worker. Unlike the per-worker
 * hooks above, the id is a call argument because it isn't known until the worker
 * is saved. Uploads sequentially, tolerates individual failures, and returns how
 * many failed so the caller can surface a single toast. Keeps API access in the
 * hooks layer (project layering rule).
 */
export function useUploadWorkerDocuments() {
  const qc = useQueryClient();
  return async (workerId: number, docs: StagedDocument[]): Promise<{ failed: number }> => {
    let failed = 0;
    for (const doc of docs) {
      try {
        await workerDocumentsApi.upload(workerId, doc.file, doc.docType);
      } catch {
        failed += 1;
      }
    }
    void qc.invalidateQueries({ queryKey: workerDocumentsKey(workerId) });
    return { failed };
  };
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
