import { useQuery } from "@tanstack/react-query";
import { propertyImagesApi } from "@/api/propertyImagesApi";

/** Query key for a property's image list. */
export function propertyImagesKey(propertyId: number) {
  return ["properties", propertyId, "images"] as const;
}

/** The gallery images attached to a property (metadata only, no bytes). */
export function usePropertyImages(propertyId: number | undefined) {
  return useQuery({
    queryKey: ["properties", propertyId, "images"],
    queryFn: () => propertyImagesApi.list(propertyId as number),
    enabled: propertyId !== undefined,
  });
}
