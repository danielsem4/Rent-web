import { useQuery } from "@tanstack/react-query";
import { companyApi } from "@/api/companyApi";

export function useCompanyQuery(id: number) {
  return useQuery({
    queryKey: ["companies", id],
    queryFn: () => companyApi.get(id),
    enabled: Number.isFinite(id),
  });
}
