/**
 * Metadata for a property gallery image. The file bytes themselves are never
 * returned by the list endpoint — they are fetched via the authenticated download
 * endpoint (as a Blob, rendered through an object URL). `storageKey` is
 * server-internal and never exposed.
 */
export interface IPropertyImage {
  id: number;
  propertyId: number;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
