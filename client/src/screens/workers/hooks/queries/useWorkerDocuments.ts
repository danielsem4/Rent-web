import { useQuery } from "@tanstack/react-query";
import { workerDocumentsApi } from "@/api/workerDocumentsApi";

/** Query key for a worker's document list. */
export function workerDocumentsKey(workerId: number) {
  return ["workers", workerId, "documents"] as const;
}

/** The identity documents attached to a worker (metadata only, no bytes). */
export function useWorkerDocuments(workerId: number | undefined) {
  return useQuery({
    queryKey: ["workers", workerId, "documents"],
    queryFn: () => workerDocumentsApi.list(workerId as number),
    enabled: workerId !== undefined,
  });
}
