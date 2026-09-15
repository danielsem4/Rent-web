import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { workersApi } from "@/api/workersApi";
import { workersKey } from "@/screens/workers/hooks/queries/useWorkers";
import { propertiesKey } from "./useProperties";

/**
 * Assign/unassign a worker to a property FROM the property page. Unlike
 * `useWorkerMutations` (which navigates back to /workers on success), these stay
 * put and refresh both the workers list AND the property (its occupancy `total`
 * is recomputed server-side, so the occupancy bar/chip must re-fetch).
 *
 * Assignment is enforced server-side: a full property (live worker count at
 * `maxCapacity`) is rejected with 409, surfaced here as a "property full" toast.
 */
function invalidateWorkerAndProperty(
  qc: ReturnType<typeof useQueryClient>,
  propertyId: number,
) {
  void qc.invalidateQueries({ queryKey: workersKey });
  void qc.invalidateQueries({ queryKey: propertiesKey });
  void qc.invalidateQueries({ queryKey: ["properties", propertyId] });
}

export function useAssignWorkerToProperty(propertyId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (workerId: number) => workersApi.update(workerId, { propertyId }),
    onSuccess: () => {
      invalidateWorkerAndProperty(qc, propertyId);
      toast.success(t("properties.assignSuccess"));
    },
    onError: (err) => {
      const full = err instanceof AxiosError && err.response?.status === 409;
      toast.error(full ? t("properties.propertyFull") : t("properties.assignFailed"));
    },
  });
}

export function useUnassignWorker(propertyId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (workerId: number) => workersApi.update(workerId, { propertyId: null }),
    onSuccess: () => {
      invalidateWorkerAndProperty(qc, propertyId);
      toast.success(t("properties.unassignSuccess"));
    },
    onError: () => toast.error(t("properties.assignFailed")),
  });
}
