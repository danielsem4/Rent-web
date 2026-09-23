import { useQuery } from "@tanstack/react-query";
import { inspectionsApi } from "@/api/inspectionsApi";

export const inspectionsKey = ["inspections"] as const;

/** Company inspections. The dashboard derives the "due soon" count from these. */
export function useInspections() {
  return useQuery({
    queryKey: inspectionsKey,
    queryFn: inspectionsApi.list,
  });
}
