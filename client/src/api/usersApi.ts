import api from "@/lib/axios";
import type { IEmployee } from "@/common/types/user";

interface ListResponse {
  users: IEmployee[];
}

export const usersApi = {
  /** Company members (manager-only endpoint; server enforces role + tenant scope). */
  async list(): Promise<IEmployee[]> {
    const { data } = await api.get<ListResponse>("/users");
    return data.users;
  },
};
