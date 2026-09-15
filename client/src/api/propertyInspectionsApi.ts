import api from "@/lib/axios";
import type { IPropertyInspection } from "@/common/types/propertyInspection";

interface ListResponse {
  inspections: IPropertyInspection[];
}

export const propertyInspectionsApi = {
  async list(propertyId: number): Promise<IPropertyInspection[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/inspections`);
    return data.inspections;
  },
};
