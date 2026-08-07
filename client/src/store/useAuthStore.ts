import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IUser } from "@/common/types/user";

interface AuthState {
  userId: number | null;
  user: IUser | null;
  setUser: (user: IUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      user: null,
      setUser: (user) => set({ user, userId: user.id }),
      logout: () => set({ user: null, userId: null }),
    }),
    {
      name: "auth-store",
      // Persist only the identity; the full user is re-fetched via /me.
      partialize: (state) => ({ userId: state.userId }),
    },
  ),
);
