import api from "@/lib/axios";
import type {
  ICompanyDetail,
  ICompanyListItem,
  ICompanyManager,
  ICreateCompanyInput,
} from "@/common/types/company";
import type { ModuleKey } from "@/common/types/module";

interface ListResponse {
  companies: ICompanyListItem[];
}
interface DetailResponse {
  company: ICompanyDetail;
}
interface ManagerResponse {
  manager: ICompanyManager;
}

/**
 * Platform-admin company management (SUPER_ADMIN only; server enforces the role).
 * Thin typed axios wrappers — no React. Mounted server-side at /api/admin/companies.
 */
export const adminApi = {
  async listCompanies(): Promise<ICompanyListItem[]> {
    const { data } = await api.get<ListResponse>("/admin/companies");
    return data.companies;
  },
  async getCompany(id: number): Promise<ICompanyDetail> {
    const { data } = await api.get<DetailResponse>(`/admin/companies/${id}`);
    return data.company;
  },
  async createCompany(input: ICreateCompanyInput): Promise<ICompanyDetail> {
    const { data } = await api.post<DetailResponse>("/admin/companies", input);
    return data.company;
  },
  async updateCompany(
    id: number,
    input: { name?: string; isActive?: boolean },
  ): Promise<ICompanyDetail> {
    const { data } = await api.patch<DetailResponse>(`/admin/companies/${id}`, input);
    return data.company;
  },
  async setModules(id: number, modules: ModuleKey[]): Promise<ICompanyDetail> {
    const { data } = await api.put<DetailResponse>(`/admin/companies/${id}/modules`, { modules });
    return data.company;
  },
  async createManager(
    id: number,
    input: { email: string; name: string },
  ): Promise<ICompanyManager> {
    const { data } = await api.post<ManagerResponse>(`/admin/companies/${id}/managers`, input);
    return data.manager;
  },
};
