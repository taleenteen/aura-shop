import { create } from "zustand";

interface CompareState {
  comparedSlugs: string[];
  highlightDifferencesOnly: boolean;
  addSlug: (slug: string) => boolean;
  removeSlug: (slug: string) => void;
  clearCompare: () => void;
  isCompared: (slug: string) => boolean;
  setHighlightDifferencesOnly: (highlight: boolean) => void;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  comparedSlugs: [],
  highlightDifferencesOnly: false,
  addSlug: (slug: string) => {
    const current = get().comparedSlugs;
    if (current.includes(slug)) {
      return true;
    }
    if (current.length >= 3) {
      return false; // Reached maximum limit of 3 laptops
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
