import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "@/api/paymentsApi";

export const paymentsKey = ["payments"] as const;

/** Company payments. The dashboard filters these to the outstanding (PENDING) ones. */
export function usePayments() {
  return useQuery({
    queryKey: paymentsKey,
    queryFn: paymentsApi.list,
  });
}
