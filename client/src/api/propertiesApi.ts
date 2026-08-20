import api from "@/lib/axios";
import type {
  IProperty,
  IPropertyListItem,
  IPropertyInput,
} from "@/common/types/property";

interface ListResponse {
  properties: IPropertyListItem[];
}
interface OneResponse {
  property: IProperty;
}

export const propertiesApi = {
  async list(): Promise<IPropertyListItem[]> {
    const { data } = await api.get<ListResponse>("/properties");
    return data.properties;
  },

  async get(id: number): Promise<IProperty> {
    const { data } = await api.get<OneResponse>(`/properties/${id}`);
    return data.property;
  },

  async create(input: IPropertyInput): Promise<IProperty> {
    const { data } = await api.post<OneResponse>("/properties", input);
    return data.property;
  },

  async update(id: number, input: IPropertyInput): Promise<IProperty> {
    const { data } = await api.patch<OneResponse>(`/properties/${id}`, input);
    return data.property;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/properties/${id}`);
  },
};
