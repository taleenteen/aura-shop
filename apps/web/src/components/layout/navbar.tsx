import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ShoppingBag,
  Heart,
  User as UserIcon,
  Sparkles,
  ChevronDown,
  LogOut,
  Package,
  UserRound,
  Shield,
  Menu,
  X,
  Laptop,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useAuthStore } from "@/stores/auth-store";
import { signOut } from "@/lib/session";
import { SEARCH_SHORTCUT } from "@/lib/platform";

export function Navbar() {
  const setCartOpen = useUIStore((state) => state.setCartOpen);
  const setCommandPaletteOpen = useUIStore(
    (state) => state.setCommandPaletteOpen
  );
  const setAuthOpen = useUIStore((state) => state.setAuthOpen);

  const cartTotalItems = useCartStore((state) => state.totalItems);
  const wishlistCount = useWishlistStore((state) => state.likedIds.length);

  const user = useAuthStore((state) => state.user);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setIsUserMenuOpen(false);
    await signOut();
  };

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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/80 dark:border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Button & Brand Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-xl text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/" aria-label="AURA TECH home" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-zinc-950 dark:bg-white flex items-center justify-center text-white dark:text-zinc-950 shadow-xs group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
            <span className="hidden sm:inline font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
              AURA TECH
            </span>
          </Link>
        </div>

        {/* Center Navigation Links (Desktop) */}
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
            aria-keyshortcuts={SEARCH_SHORTCUT.aria}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-medium border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500">
              {SEARCH_SHORTCUT.label}
            </kbd>
          </button>

          {/* Wishlist Link with count badge */}
          <Link
            to="/wishlist"
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

          {/* Admin Console Shortcut (admins only) */}
          {user?.role === "ADMIN" && (
            <Link
              to="/admin"
              className="hidden sm:inline-flex px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition-colors"
            >
              Admin
            </Link>
          )}

          {/* User Account / Profile Dropdown */}
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-[11px] flex items-center justify-center shadow-xs">
                  {getInitials(user.full_name)}
                </div>
                <span className="hidden sm:inline text-xs font-semibold text-zinc-900 dark:text-white max-w-[100px] truncate">
                  {user.full_name.split(" ")[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              {/* Profile Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs font-bold text-zinc-950 dark:text-white truncate">
                      {user.full_name}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {user.role}
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/account"
                      search={{ tab: "orders" }}
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                    >
                      <Package className="w-3.5 h-3.5 text-zinc-400" />
                      <span>My Orders</span>
                    </Link>
                    <Link
                      to="/account"
                      search={{ tab: "profile" }}
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                    >
                      <UserRound className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Profile & Address</span>
                    </Link>

                    {user.role === "ADMIN" && (
                      <Link
                        to="/admin"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-xs text-amber-600 dark:text-amber-400 font-semibold hover:bg-amber-500/10 transition-colors"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Admin Backoffice</span>
                      </Link>
                    )}
                  </div>

                  <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 shadow-xs transition-all cursor-pointer"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Slide-over Drawer Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Slide-over Drawer from Left */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 w-full max-w-xs bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between z-50 p-6"
            >
              {/* Drawer Header */}
              <div>
                <div className="flex items-center justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800">
                  <Link
                    to="/"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-2"
                  >
                    <div className="w-8 h-8 rounded-xl bg-zinc-950 dark:bg-white flex items-center justify-center text-white dark:text-zinc-950 shadow-xs">
                      <Sparkles className="w-4 h-4 fill-current" />
                    </div>
                    <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-950 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
                      AURA TECH
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 cursor-pointer"
                    aria-label="Close Navigation Menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Categories List */}
                <div className="py-6 space-y-1">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Hardware Categories
                  </p>
                  {navLinks.map((link) => (
                    <Link
                      key={link.label}
                      to={link.href}
                      search={link.search}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <span>{link.label}</span>
                    </Link>
                  ))}
                  <Link
                    to="/catalog"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold text-zinc-950 dark:text-white bg-zinc-100 dark:bg-zinc-900 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Laptop className="w-4 h-4" />
                      <span>All Products</span>
                    </div>
                  </Link>
                </div>
              </div>

              {/* Drawer Footer & Account Info */}
              <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                {user ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs flex items-center justify-center">
                        {getInitials(user.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-zinc-950 dark:text-white truncate">
                          {user.full_name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
                      </div>
                    </div>
                    <Link
                      to="/account"
                      search={{ tab: "orders" }}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Package className="w-4 h-4" />
                      <span>My Orders</span>
                    </Link>
                    <Link
                      to="/account"
                      search={{ tab: "profile" }}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <UserRound className="w-4 h-4" />
                      <span>Profile & Address</span>
                    </Link>
                    {user.role === "ADMIN" && (
                      <Link
                        to="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      >
                        <Shield className="w-4 h-4" />
                        <span>Admin Backoffice</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setAuthOpen(true);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center gap-2 shadow-xs cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <UserIcon className="w-4 h-4" />
                    <span>Customer Sign In</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}
