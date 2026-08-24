/** Client-side size cap. The server (magic bytes + limit) is the enforcement point. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** react-dropzone accept map; mirrors the server allow-list (images only). */
export const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * An image chosen while creating a property, held in the browser until the property
 * is saved (and thus has an id). `uid` is a local key for grid rendering / removal;
 * `previewUrl` is an object URL for the staged thumbnail (revoked on removal).
 */
export interface StagedImage {
  uid: string;
  file: File;
  previewUrl: string;
}
