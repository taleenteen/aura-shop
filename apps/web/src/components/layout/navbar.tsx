import { Link } from "@tanstack/react-router";
import { Search, ShoppingBag, Heart, User as UserIcon, Sparkles } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useAuthStore } from "@/stores/auth-store";

export function Navbar() {
  const setCartOpen = useUIStore((state) => state.setCartOpen);
  const setCommandPaletteOpen = useUIStore(
    (state) => state.setCommandPaletteOpen
  );

  const cartTotalItems = useCartStore((state) => state.totalItems);
  const wishlistCount = useWishlistStore((state) => state.likedIds.length);
  const user = useAuthStore((state) => state.user);

  const navLinks = [
    { label: "Mac", href: "/catalog", search: { category: "mac" } },
    { label: "Ultrabooks", href: "/catalog", search: { category: "ultrabooks" } },
    {
      label: "Gaming",
      href: "/catalog",
      search: { category: "gaming-laptops" },
    },
    { label: "Monitors", href: "/catalog", search: { category: "monitors" } },
    {
      label: "Accessories",
      href: "/catalog",
      search: { category: "accessories" },
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/80 dark:border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-xl bg-zinc-950 dark:bg-white flex items-center justify-center text-white dark:text-zinc-950 shadow-xs group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4 fill-current" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
            AURA TECH
          </span>
        </Link>

        {/* Center Navigation Links */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              search={link.search}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/catalog"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:opacity-80 transition-opacity"
          >
            All Products
          </Link>
        </nav>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Cmd+K Search Trigger */}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-medium border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500">
              ⌘K
            </kbd>
          </button>

          {/* Wishlist Link with count badge */}
          <Link
            to="/catalog"
            className="relative p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
            aria-label="Wishlist"
          >
            <Heart className="w-5 h-5" />
            {wishlistCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {wishlistCount}
              </span>
            )}
          </Link>

          {/* Cart Drawer Trigger with total items count */}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
            aria-label="Shopping Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartTotalItems > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                {cartTotalItems}
              </span>
            )}
          </button>

          {/* Admin Console Shortcut */}
          <Link
            to="/admin"
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition-colors"
          >
            Admin
          </Link>

          {/* User Account / Admin Badge */}
          {user ? (
            <div className="flex items-center gap-2 pl-1">
              <span className="hidden lg:inline text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {user.full_name}
              </span>
            </div>
          ) : (
            <Link
              to="/catalog"
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
              aria-label="Account"
            >
              <UserIcon className="w-5 h-5" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
