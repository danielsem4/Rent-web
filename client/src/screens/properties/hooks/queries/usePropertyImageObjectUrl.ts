import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { propertyImagesApi } from "@/api/propertyImagesApi";

/**
 * Resolve a property image to a browser-renderable object URL. The bytes are
 * fetched through the authenticated, tenant-scoped download endpoint (never a
 * public URL — the server serves them as `attachment`/`nosniff`), cached by
 * react-query as a Blob, then wrapped in an `object:` URL for `<img src>`.
 *
 * The object URL is created per-consumer and revoked on unmount / when the blob
 * changes, so it never leaks.
 */
export function usePropertyImageObjectUrl(propertyId: number, imageId: number) {
  const {
    data: blob,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["properties", propertyId, "images", imageId, "blob"],
    queryFn: () => propertyImagesApi.download(propertyId, imageId),
  });

  // Derive the object URL from the blob (no setState) so the value is available
  // on the same render the blob resolves. The cleanup effect below revokes the
  // previous URL whenever it changes and on unmount, so it never leaks.
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return { url, isLoading, isError };
}
