import api from "@/lib/axios";
import type { IProperty, IPropertyStats } from "@/common/types/property";

export interface PropertyInput {
  city: string;
  address: string;
  entryCode?: string | null;
  electricMeter?: string | null;
  waterMeter?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  monthlyRent: number;
  capacity: number;
  notes?: string | null;
}

export const propertyApi = {
  async list(): Promise<IProperty[]> {
    const { data } = await api.get<{ properties: IProperty[] }>("/properties");
    return data.properties;
  },

  async stats(): Promise<IPropertyStats> {
    const { data } = await api.get<{ stats: IPropertyStats }>("/properties/stats");
    return data.stats;
  },

  async get(id: number): Promise<IProperty> {
    const { data } = await api.get<{ property: IProperty }>(`/properties/${id}`);
    return data.property;
  },

  async create(input: PropertyInput): Promise<IProperty> {
    const { data } = await api.post<{ property: IProperty }>("/properties", input);
    return data.property;
  },

  async update(id: number, input: Partial<PropertyInput>): Promise<IProperty> {
    const { data } = await api.put<{ property: IProperty }>(`/properties/${id}`, input);
    return data.property;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/properties/${id}`);
  },
};
