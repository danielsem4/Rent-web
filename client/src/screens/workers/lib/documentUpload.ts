import type { WorkerDocumentType } from "@/common/types/workerDocument";

/** Selectable document categories (mirrors the server enum). */
export const DOC_TYPES: WorkerDocumentType[] = ["PASSPORT", "VISA", "INSURANCE", "OTHER"];

/** Client-side size cap. The server (magic bytes + limit) is the enforcement point. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** react-dropzone accept map; mirrors the server allow-list. */
export const ACCEPT = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

/** Shared native-select styling so selects read as one system with shadcn inputs. */
export const SELECT_CLASS =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A document chosen while creating a worker, held in the browser until the worker
 * is saved (and thus has an id). `uid` is a local key for list rendering / removal.
 */
export interface StagedDocument {
  uid: string;
  file: File;
  docType: WorkerDocumentType;
}
