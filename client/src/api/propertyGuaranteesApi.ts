import api from "@/lib/axios";
import type { IPropertyGuarantee } from "@/common/types/propertyGuarantee";

interface ListResponse {
  guarantees: IPropertyGuarantee[];
}

export const propertyGuaranteesApi = {
  async list(propertyId: number): Promise<IPropertyGuarantee[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/guarantees`);
    return data.guarantees;
  },
};
