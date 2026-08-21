import { useQuery } from "@tanstack/react-query";
import { workersApi } from "@/api/workersApi";

export const workersKey = ["workers"] as const;

/** List of the current company's workers (identifier numbers omitted server-side). */
export function useWorkers() {
  return useQuery({
    queryKey: workersKey,
    queryFn: workersApi.list,
  });
}

/** A single worker with full detail (incl. decrypted identifier numbers). */
export function useWorker(id: number | undefined) {
  return useQuery({
    queryKey: ["workers", id],
    queryFn: () => workersApi.get(id as number),
    enabled: id !== undefined,
  });
}
