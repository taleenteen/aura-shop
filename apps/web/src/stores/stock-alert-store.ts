import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import type { StockAlert } from "@/types/api";

interface StockAlertState {
  /** Pending alerts of the signed-in customer; empty for guests. */
  alerts: StockAlert[];
  loaded: boolean;
  load: () => Promise<void>;
  subscribe: (variantId: string) => Promise<void>;
  unsubscribe: (variantId: string) => Promise<void>;
  reset: () => void;
}

/** The signed-in customer's "email me when it's back" requests. */
export const useStockAlertStore = create<StockAlertState>((set, get) => ({
  alerts: [],
  loaded: false,
  load: async () => {
    try {
      const res = await apiClient<StockAlert[]>("/account/stock-alerts");
      set({ alerts: res.data || [], loaded: true });
    } catch {
      set({ alerts: [], loaded: true });
    }
  },
  subscribe: async (variantId) => {
    await apiClient(`/account/stock-alerts/${variantId}`, { method: "PUT" });
    await get().load();
  },
  unsubscribe: async (variantId) => {
    await apiClient(`/account/stock-alerts/${variantId}`, { method: "DELETE" });
    set({ alerts: get().alerts.filter((a) => a.variant_id !== variantId) });
  },
  reset: () => set({ alerts: [], loaded: false }),
}));
