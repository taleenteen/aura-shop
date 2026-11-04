import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import type { Wishlist, WishlistToggleResponse } from "@/types/api";

interface WishlistState {
  likedIds: string[];
  isLoading: boolean;
  isLiked: (productId: string) => boolean;
  toggleLike: (productId: string) => Promise<boolean>;
  loadWishlist: () => Promise<void>;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  likedIds: [],
  isLoading: false,
  isLiked: (productId: string) => {
    return get().likedIds.includes(productId);
  },
  toggleLike: async (productId: string) => {
    const current = get().likedIds;
    const isCurrentlyLiked = current.includes(productId);

    // Optimistic update
    if (isCurrentlyLiked) {
      set({ likedIds: current.filter((id) => id !== productId) });
    } else {
      set({ likedIds: [...current, productId] });
    }

    try {
      const res = await apiClient<WishlistToggleResponse>("/wishlist/toggle", {
        method: "POST",
        body: JSON.stringify({ product_id: productId }),
      });
      // Reconcile with server response
      if (res.data.liked) {
        if (!get().likedIds.includes(productId)) {
          set({ likedIds: [...get().likedIds, productId] });
        }
      } else {
        set({ likedIds: get().likedIds.filter((id) => id !== productId) });
      }
      return res.data.liked;
    } catch (err) {
      // Revert on error
      set({ likedIds: current });
      throw err;
    }
  },
  loadWishlist: async () => {
    set({ isLoading: true });
    try {
      const res = await apiClient<Wishlist[]>("/wishlist");
      const ids = (res.data || []).map((item) => item.product_id);
      set({ likedIds: ids, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
