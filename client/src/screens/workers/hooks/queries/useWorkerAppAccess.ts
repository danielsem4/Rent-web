import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { workerAppAccessApi } from "@/api/workerAppAccessApi";

/** Query key for a worker's app-access status. */
export const workerAppAccessKey = (id: number) => ["worker-app-access", id] as const;

/** Read the current app-access status for a worker (manager-only server-side). */
export function useWorkerAppAccess(id: number | undefined) {
  return useQuery({
    queryKey: workerAppAccessKey(id ?? 0),
    queryFn: () => workerAppAccessApi.get(id as number),
    enabled: id != null,
  });
}

/** Enable app access (issues the QR + claims the phone). */
export function useEnableAppAccess(id: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (phone?: string) => workerAppAccessApi.enable(id, phone),
    onSuccess: (appAccess) => {
      qc.setQueryData(workerAppAccessKey(id), appAccess);
      toast.success(t("workers.appAccess.enabled"));
    },
    onError: (err: unknown) => toast.error(appAccessError(err, t("workers.appAccess.enableFailed"))),
  });
}

/** Rotate the QR (invalidates the previous one). */
export function useRotateWorkerQr(id: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => workerAppAccessApi.rotateQr(id),
    onSuccess: (appAccess) => {
      qc.setQueryData(workerAppAccessKey(id), appAccess);
      toast.success(t("workers.appAccess.rotated"));
    },
    onError: () => toast.error(t("workers.appAccess.rotateFailed")),
  });
}

/** Disable app access (revokes all sessions + releases the phone). */
export function useDisableAppAccess(id: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => workerAppAccessApi.disable(id),
    onSuccess: (appAccess) => {
      qc.setQueryData(workerAppAccessKey(id), appAccess);
      toast.success(t("workers.appAccess.disabled"));
    },
    onError: () => toast.error(t("workers.appAccess.disableFailed")),
  });
}

/** Surface the server's 409 conflict message (e.g. phone already registered) when present. */
function appAccessError(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}
