/**
 * Validation for property-image uploads (SECURITY_PRINCIPLES.md §16).
 *
 * The file arrives as multipart (parsed by multer into `req.file`). Unlike worker
 * documents there is NO text field — the request body is empty. File CONTENT is
 * validated by magic bytes below; the browser-supplied MIME type is NEVER trusted.
 *
 * IMAGES ONLY: the gallery renders these as `<img>`, so the allow-list drops PDF
 * and keeps jpeg/png/webp.
 */

/** Max upload size — mirrored by the multer `limits.fileSize` guard. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowed MIME types (advisory allow-list for multer; magic bytes are authoritative). */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Canonical image kinds we accept, with the MIME we report on download. */
export type SniffedType = 'jpeg' | 'png' | 'webp';

const MIME_BY_TYPE: Record<SniffedType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Content-based type detection by magic bytes — the authoritative allow-list
 * check (§16: "never trust browser MIME"). Returns the canonical type or null
 * (→ reject). Signatures: JPEG `FF D8 FF`, PNG 8-byte header, WEBP `RIFF....WEBP`.
 */
export function sniffFileType(buffer: Buffer): SniffedType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && PNG_SIG.every((b, i) => buffer[i] === b)) {
    return 'png';
  }
  // WEBP: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP" (RIFF container fourCC).
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Canonical MIME for a sniffed type (what we store + send on download). */
export function mimeForType(type: SniffedType): string {
  return MIME_BY_TYPE[type];
}
