import { create } from "zustand";
import type { User } from "@/types/api";
import { apiClient, setAuthToken, getAuthToken } from "@/lib/api-client";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True while a stored token is being exchanged for the user profile after a page load. */
  isRestoring: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  /** Replaces the signed-in user after a profile update. */
  setUser: (user: User) => void;
  /** Loads the profile for a token persisted in localStorage. Safe to call more than once. */
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getAuthToken(),
  isAuthenticated: !!getAuthToken(),
  isRestoring: !!getAuthToken(),
  setAuth: (user: User, token: string) => {
    setAuthToken(token);
    set({ user, token, isAuthenticated: true, isRestoring: false });
  },
  setUser: (user: User) => set({ user }),
  clearAuth: () => {
    setAuthToken(null);
    set({ user: null, token: null, isAuthenticated: false, isRestoring: false });
  },
  restoreSession: async () => {
    const token = get().token;
    if (!token || get().user) {
      set({ isRestoring: false });
      return;
    }
    try {
      const res = await apiClient<User>("/auth/me");
      // Ignore the result if the user signed in or out while the request was in flight.
      if (get().token === token) set({ user: res.data, isRestoring: false });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (get().token !== token) return;
      if (code === "UNAUTHORIZED" || code === "NOT_FOUND") {
        // Expired, invalid, or orphaned token: fall back to a guest session.
        get().clearAuth();
      } else {
        // Network or server error: keep the token so a later reload can retry.
        set({ isRestoring: false });
      }
    }
  },
}));
