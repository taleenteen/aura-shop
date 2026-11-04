import { create } from "zustand";
import type { User } from "@/types/api";
import { setAuthToken, getAuthToken } from "@/lib/api-client";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getAuthToken(),
  isAuthenticated: !!getAuthToken(),
  setAuth: (user: User, token: string) => {
    setAuthToken(token);
    set({ user, token, isAuthenticated: true });
  },
  clearAuth: () => {
    setAuthToken(null);
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
