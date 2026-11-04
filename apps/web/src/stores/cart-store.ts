import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import type { CartResponse, CartItemDTO } from "@/types/api";

interface CartState {
  items: CartItemDTO[];
  totalItems: number;
  subtotalAmount: number;
  isLoading: boolean;
  fetchCart: () => Promise<void>;
  addToCart: (
    variantId: string,
    quantity?: number,
    bundleAccessoryVariantIds?: string[]
  ) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  totalItems: 0,
  subtotalAmount: 0,
  isLoading: false,

  fetchCart: async () => {
    set({ isLoading: true });
    try {
      const res = await apiClient<CartResponse>("/cart");
      set({
        items: res.data?.items || [],
        totalItems: res.data?.total_items || 0,
        subtotalAmount: res.data?.subtotal_amount || 0,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addToCart: async (
    variantId: string,
    quantity = 1,
    bundleAccessoryVariantIds = []
  ) => {
    set({ isLoading: true });
    try {
      const res = await apiClient<CartResponse>("/cart/items", {
        method: "POST",
        body: JSON.stringify({
          variant_id: variantId,
          quantity,
          bundle_accessory_variant_ids: bundleAccessoryVariantIds,
        }),
      });
      set({
        items: res.data?.items || [],
        totalItems: res.data?.total_items || 0,
        subtotalAmount: res.data?.subtotal_amount || 0,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  updateQuantity: async (itemId: string, quantity: number) => {
    set({ isLoading: true });
    try {
      const res = await apiClient<CartResponse>(`/cart/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
      set({
        items: res.data?.items || [],
        totalItems: res.data?.total_items || 0,
        subtotalAmount: res.data?.subtotal_amount || 0,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  removeItem: async (itemId: string) => {
    set({ isLoading: true });
    try {
      const res = await apiClient<CartResponse>(`/cart/items/${itemId}`, {
        method: "DELETE",
      });
      set({
        items: res.data?.items || [],
        totalItems: res.data?.total_items || 0,
        subtotalAmount: res.data?.subtotal_amount || 0,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
