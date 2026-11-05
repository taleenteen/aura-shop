import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import type { Banner, BannerPlacement, Category } from "@/types/api";

type BannersByPlacement = Record<BannerPlacement, Banner[]>;

interface StorefrontState {
  categories: Category[];
  banners: BannersByPlacement;
  /** Loads categories and live banners once; later calls reuse the result. */
  load: () => Promise<void>;
  /** Re-fetches after an admin change so the menu and banners update without a reload. */
  refresh: () => Promise<void>;
}

const EMPTY: BannersByPlacement = { HERO_SPLIT: [], BENTO_GRID: [], TOP_RIBBON: [] };
let inflight: Promise<void> | null = null;

/** Store-wide content shared by the navbar, footer, top ribbon and home page. */
export const useStorefrontStore = create<StorefrontState>((set, get) => ({
  categories: [],
  banners: EMPTY,
  load: () => {
    inflight ??= get().refresh();
    return inflight;
  },
  refresh: async () => {
    const [cats, banners] = await Promise.allSettled([
      apiClient<Category[]>("/categories"),
      apiClient<BannersByPlacement>("/banners"),
    ]);
    set({
      ...(cats.status === "fulfilled" ? { categories: cats.value.data || [] } : {}),
      ...(banners.status === "fulfilled" ? { banners: { ...EMPTY, ...(banners.value.data || {}) } } : {}),
    });
  },
}));
