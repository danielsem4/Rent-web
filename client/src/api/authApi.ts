import api from "@/lib/axios";
import type { IUser } from "@/common/types/user";

interface AuthResponse {
  user: IUser;
}

export const authApi = {
  async login(email: string, password: string): Promise<IUser> {
    const { data } = await api.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    return data.user;
  },

  async me(): Promise<IUser> {
    const { data } = await api.get<AuthResponse>("/auth/me");
    return data.user;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout");
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await api.post("/auth/change-password", { currentPassword, newPassword });
  },
};
