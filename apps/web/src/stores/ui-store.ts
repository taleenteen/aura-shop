import { create } from "zustand";

interface UIState {
  isCartOpen: boolean;
  isCommandPaletteOpen: boolean;
  isCompareOpen: boolean;
  isAuthOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setAuthOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isCartOpen: false,
  isCommandPaletteOpen: false,
  isCompareOpen: false,
  isAuthOpen: false,
  setCartOpen: (open: boolean) => set({ isCartOpen: open }),
  setCommandPaletteOpen: (open: boolean) => set({ isCommandPaletteOpen: open }),
  setCompareOpen: (open: boolean) => set({ isCompareOpen: open }),
  setAuthOpen: (open: boolean) => set({ isAuthOpen: open }),
}));
