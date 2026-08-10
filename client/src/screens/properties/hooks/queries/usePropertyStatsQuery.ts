import { useQuery } from "@tanstack/react-query";
import { propertyApi } from "@/api/propertyApi";

export function usePropertyStatsQuery() {
  return useQuery({
    queryKey: ["properties", "stats"],
    queryFn: propertyApi.stats,
  });
}
