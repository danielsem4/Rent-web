import { useQuery } from "@tanstack/react-query";
import { companyApi } from "@/api/companyApi";

export function useCompaniesQuery() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: companyApi.list,
  });
}
