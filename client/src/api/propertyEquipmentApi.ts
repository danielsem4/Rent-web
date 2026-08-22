import api from "@/lib/axios";
import type {
  IPropertyEquipment,
  IPropertyEquipmentInput,
} from "@/common/types/propertyEquipment";

interface ListResponse {
  equipment: IPropertyEquipment[];
}
interface OneResponse {
  equipment: IPropertyEquipment;
}

export const propertyEquipmentApi = {
  async list(propertyId: number): Promise<IPropertyEquipment[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/equipment`);
    return data.equipment;
  },

  async create(
    propertyId: number,
    input: IPropertyEquipmentInput,
  ): Promise<IPropertyEquipment> {
    const { data } = await api.post<OneResponse>(`/properties/${propertyId}/equipment`, input);
    return data.equipment;
  },

  async remove(propertyId: number, id: number): Promise<void> {
    await api.delete(`/properties/${propertyId}/equipment/${id}`);
  },
};
