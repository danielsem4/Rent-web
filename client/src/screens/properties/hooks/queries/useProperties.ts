import { useQuery } from "@tanstack/react-query";
import { propertiesApi } from "@/api/propertiesApi";

export const propertiesKey = ["properties"] as const;

/** List of the current company's properties (entryCode omitted server-side). */
export function useProperties() {
  return useQuery({
    queryKey: propertiesKey,
    queryFn: propertiesApi.list,
  });
}

/** A single property with full detail (incl. entryCode). */
export function useProperty(id: number | undefined) {
  return useQuery({
    queryKey: ["properties", id],
    queryFn: () => propertiesApi.get(id as number),
    enabled: id !== undefined,
  });
}
