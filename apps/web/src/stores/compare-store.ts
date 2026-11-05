import { create } from "zustand";

export const MAX_COMPARE = 3;

interface CompareState {
  comparedSlugs: string[];
  highlightDifferencesOnly: boolean;
  /** Time of the last add rejected because the tray was full; drives the "max 3" notice. */
  limitHitAt: number | null;
  addSlug: (slug: string) => boolean;
  removeSlug: (slug: string) => void;
  clearCompare: () => void;
  isCompared: (slug: string) => boolean;
  setHighlightDifferencesOnly: (highlight: boolean) => void;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  comparedSlugs: [],
  highlightDifferencesOnly: false,
  limitHitAt: null,
  addSlug: (slug: string) => {
    const current = get().comparedSlugs;
    if (current.includes(slug)) {
      return true;
    }
    if (current.length >= MAX_COMPARE) {
      set({ limitHitAt: Date.now() });
      return false;
    }
    set({ comparedSlugs: [...current, slug] });
    return true;
  },
  removeSlug: (slug: string) => {
    set({ comparedSlugs: get().comparedSlugs.filter((s) => s !== slug) });
  },
  clearCompare: () => {
    set({ comparedSlugs: [] });
  },
  isCompared: (slug: string) => {
    return get().comparedSlugs.includes(slug);
  },
  setHighlightDifferencesOnly: (highlight: boolean) => {
    set({ highlightDifferencesOnly: highlight });
  },
}));
