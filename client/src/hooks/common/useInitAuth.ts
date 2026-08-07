import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/authApi";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Fetches the current user via /me on mount and keeps the auth store in sync.
 * Used by ProtectedLayout to gate authenticated routes.
 */
export function useInitAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);

  useEffect(() => {
    if (query.isError) logout();
  }, [query.isError, logout]);

  return {
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
    isError: query.isError,
  };
}
