import { useEffect } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { TopRibbon } from "@/components/layout/top-ribbon";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { LenisManager } from "@/app/lenis-manager";
import { CommandPalette } from "@/features/search/command-palette";
import { CompareFloatingTray } from "@/features/compare/compare-floating-tray";
import { CompareModal } from "@/features/compare/compare-modal";
import { CartDrawer } from "@/features/cart/cart-drawer";
import { AuthModal } from "@/features/auth/auth-modal";
import { useAuthStore } from "@/stores/auth-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

export function RootLayout() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const restoreSession = useAuthStore((state) => state.restoreSession);
  const loadWishlist = useWishlistStore((state) => state.loadWishlist);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const isAuthOpen = useUIStore((state) => state.isAuthOpen);
  const setAuthOpen = useUIStore((state) => state.setAuthOpen);

  useEffect(() => {
    // Restore the signed-in user from a persisted token, then fetch cart and wishlist.
    restoreSession();
    loadWishlist();
    fetchCart();
  }, [restoreSession, loadWishlist, fetchCart]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-950">
      <LenisManager pathname={pathname} />
      <TopRibbon />
      <Navbar />
      <main className="flex-1 w-full flex flex-col">
        <Outlet />
      </main>
      <CompareFloatingTray />
      <CompareModal />
      <CommandPalette />
      <CartDrawer />
      <AuthModal isOpen={isAuthOpen} onClose={() => setAuthOpen(false)} />
      <Footer />
    </div>
  );
}
