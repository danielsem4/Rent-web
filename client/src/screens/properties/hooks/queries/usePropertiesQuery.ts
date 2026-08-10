import { useQuery } from "@tanstack/react-query";
import { propertyApi } from "@/api/propertyApi";

export function usePropertiesQuery() {
  return useQuery({
    queryKey: ["properties"],
    queryFn: propertyApi.list,
  });
}
