import api from "@/lib/axios";
import type { IWorkerDocument, WorkerDocumentType } from "@/common/types/workerDocument";

interface ListResponse {
  documents: IWorkerDocument[];
}
interface OneResponse {
  document: IWorkerDocument;
}

export const workerDocumentsApi = {
  async list(workerId: number): Promise<IWorkerDocument[]> {
    const { data } = await api.get<ListResponse>(`/workers/${workerId}/documents`);
    return data.documents;
  },

  async upload(
    workerId: number,
    file: File,
    docType: WorkerDocumentType,
  ): Promise<IWorkerDocument> {
    const form = new FormData();
    form.append("docType", docType);
    form.append("file", file);
    // Do NOT set Content-Type — axios sets the multipart boundary automatically.
    const { data } = await api.post<OneResponse>(`/workers/${workerId}/documents`, form);
    return data.document;
  },

  /** Fetch the (decrypted) file bytes as a Blob for download. */
  async download(workerId: number, id: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`/workers/${workerId}/documents/${id}/download`, {
      responseType: "blob",
    });
    return data;
  },

  async remove(workerId: number, id: number): Promise<void> {
    await api.delete(`/workers/${workerId}/documents/${id}`);
  },
};
