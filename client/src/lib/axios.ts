import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import i18n from "@/i18n";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url ?? "");
    const originalRequest: AxiosRequestConfig & { _retry?: boolean } =
      error.config;

    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/logout");

    if (status !== 401 || isAuthEndpoint || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: () => resolve(api(originalRequest)),
          reject,
        });
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      await api.post("/auth/refresh");
      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      useAuthStore.getState().logout();
      toast.error(i18n.t("common.sessionExpired"));
      window.location.href = "/";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
