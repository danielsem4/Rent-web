/** Kind of identity document attached to a worker. */
export type WorkerDocumentType = "PASSPORT" | "VISA" | "INSURANCE" | "OTHER";

/**
 * Metadata for an uploaded worker document. The file bytes themselves are never
 * returned by the list endpoint — they are fetched via the authenticated download
 * endpoint. `storageKey` is server-internal and never exposed.
 */
export interface IWorkerDocument {
  id: number;
  workerId: number;
  docType: WorkerDocumentType;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
