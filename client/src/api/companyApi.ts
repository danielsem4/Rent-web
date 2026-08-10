import api from "@/lib/axios";
import type { ICompany } from "@/common/types/company";

export interface CompanyInput {
  name: string;
}

export const companyApi = {
  async list(): Promise<ICompany[]> {
    const { data } = await api.get<{ companies: ICompany[] }>("/companies");
    return data.companies;
  },

  async get(id: number): Promise<ICompany> {
    const { data } = await api.get<{ company: ICompany }>(`/companies/${id}`);
    return data.company;
  },

  async create(input: CompanyInput): Promise<ICompany> {
    const { data } = await api.post<{ company: ICompany }>("/companies", input);
    return data.company;
  },

  async update(id: number, input: Partial<CompanyInput>): Promise<ICompany> {
    const { data } = await api.put<{ company: ICompany }>(`/companies/${id}`, input);
    return data.company;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/companies/${id}`);
  },
};
