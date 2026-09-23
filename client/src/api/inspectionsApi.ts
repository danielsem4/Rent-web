import api from "@/lib/axios";
import type { IInspectionListItem } from "@/common/types/inspection";

interface ListResponse {
  inspections: IInspectionListItem[];
}

export const inspectionsApi = {
  /** Company-wide inspections (server enforces role + tenant scope). */
  async list(): Promise<IInspectionListItem[]> {
    const { data } = await api.get<ListResponse>("/inspections");
    return data.inspections;
  },
};
