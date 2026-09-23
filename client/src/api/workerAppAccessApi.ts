import api from "@/lib/axios";

/** Manager-facing app-access status for a worker (no secrets). */
export interface IWorkerAppAccess {
  id: number;
  authEnabled: boolean;
  phone: string | null;
  hasQr: boolean;
}

interface AppAccessResponse {
  appAccess: IWorkerAppAccess;
}

/**
 * Manager-only mobile-app access controls for a worker. All enforcement is
 * server-side (COMPANY_MANAGER + tenant scoping); these are thin typed calls.
 */
export const workerAppAccessApi = {
  async get(workerId: number): Promise<IWorkerAppAccess> {
    const { data } = await api.get<AppAccessResponse>(`/workers/${workerId}/app-access`);
    return data.appAccess;
  },

  async enable(workerId: number, phone?: string): Promise<IWorkerAppAccess> {
    const { data } = await api.post<AppAccessResponse>(
      `/workers/${workerId}/app-access/enable`,
      phone ? { phone } : {},
    );
    return data.appAccess;
  },

  async rotateQr(workerId: number): Promise<IWorkerAppAccess> {
    const { data } = await api.post<AppAccessResponse>(`/workers/${workerId}/app-access/rotate-qr`);
    return data.appAccess;
  },

  async disable(workerId: number): Promise<IWorkerAppAccess> {
    const { data } = await api.post<AppAccessResponse>(`/workers/${workerId}/app-access/disable`);
    return data.appAccess;
  },

  /** Fetch the current QR as a PNG blob (rendered server-side, no-store). */
  async qrBlob(workerId: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`/workers/${workerId}/app-access/qr`, {
      responseType: "blob",
    });
    return data;
  },
};
