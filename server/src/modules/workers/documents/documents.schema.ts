import { z } from 'zod';

/**
 * Validation for worker-document uploads (SECURITY_PRINCIPLES.md §16).
 *
 * The file arrives as multipart (parsed by multer into `req.file`); the only
 * text field is `docType`, validated here. File CONTENT is validated separately
 * by magic bytes in the service — the browser-supplied MIME type is NEVER trusted.
 */

export const uploadDocumentSchema = z.object({
  docType: z.enum(['PASSPORT', 'VISA', 'INSURANCE', 'OTHER']),
});

export type UploadDocumentDto = z.infer<typeof uploadDocumentSchema>;

/** Max upload size — mirrored by the multer `limits.fileSize` guard. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowed MIME types (advisory allow-list for multer; magic bytes are authoritative). */
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** Canonical file kinds we accept, with the MIME we report on download. */
export type SniffedType = 'pdf' | 'jpeg' | 'png';

const MIME_BY_TYPE: Record<SniffedType, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Content-based type detection by magic bytes — the authoritative allow-list
 * check (§16: "never trust browser MIME"). Returns the canonical type or null
 * (→ reject). Signatures: PDF `%PDF`, JPEG `FF D8 FF`, PNG 8-byte header.
 */
export function sniffFileType(buffer: Buffer): SniffedType | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && PNG_SIG.every((b, i) => buffer[i] === b)) {
    return 'png';
  }
  return null;
}

/** Canonical MIME for a sniffed type (what we store + send on download). */
export function mimeForType(type: SniffedType): string {
  return MIME_BY_TYPE[type];
}
