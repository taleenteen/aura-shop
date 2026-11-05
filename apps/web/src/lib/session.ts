import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";

/**
 * Signs out and leaves the browser as a brand-new guest: every localStorage key is removed
 * (token and guest session id included), in-memory cart, wishlist and compare state is reset,
 * then the empty guest cart and wishlist are fetched under a fresh guest session id.
 * The account's hearts and bag stay on the server and come back on the next sign-in.
 */
export async function signOut(): Promise<void> {
  useAuthStore.getState().clearAuth();
  try {
    localStorage.clear();
  } catch {
    // Storage can be unavailable (private mode, blocked site data); state is reset below anyway.
  }
  useCartStore.setState({ items: [], totalItems: 0, subtotalAmount: 0 });
  useWishlistStore.setState({ likedIds: [] });
  useCompareStore.getState().clearCompare();

  await Promise.all([useCartStore.getState().fetchCart(), useWishlistStore.getState().loadWishlist()]);
}
