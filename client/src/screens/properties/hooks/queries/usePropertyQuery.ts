import { useQuery } from "@tanstack/react-query";
import { propertyApi } from "@/api/propertyApi";

export function usePropertyQuery(id: number) {
  return useQuery({
    queryKey: ["properties", id],
    queryFn: () => propertyApi.get(id),
    enabled: Number.isFinite(id),
  });
}
