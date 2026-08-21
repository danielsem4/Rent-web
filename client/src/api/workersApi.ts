import api from "@/lib/axios";
import type { IWorker, IWorkerListItem, IWorkerInput } from "@/common/types/worker";

interface ListResponse {
  workers: IWorkerListItem[];
}
interface OneResponse {
  worker: IWorker;
}

export const workersApi = {
  async list(): Promise<IWorkerListItem[]> {
    const { data } = await api.get<ListResponse>("/workers");
    return data.workers;
  },

  async get(id: number): Promise<IWorker> {
    const { data } = await api.get<OneResponse>(`/workers/${id}`);
    return data.worker;
  },

  async create(input: IWorkerInput): Promise<IWorker> {
    const { data } = await api.post<OneResponse>("/workers", input);
    return data.worker;
  },

  async update(id: number, input: IWorkerInput): Promise<IWorker> {
    const { data } = await api.patch<OneResponse>(`/workers/${id}`, input);
    return data.worker;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/workers/${id}`);
  },
};
