import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/usersApi";

export const usersKey = ["users"] as const;

/**
 * Company members. Cross-screen hook — consumed by both the manager dashboard
 * (active-employee count) and the employees screen.
 */
export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: usersApi.list,
  });
}
