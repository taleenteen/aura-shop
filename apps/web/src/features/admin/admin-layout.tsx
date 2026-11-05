import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Image as ImageIcon, Package, ArrowLeft, Shield, LogIn, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/demo-mode";
import { useUIStore } from "@/stores/ui-store";
import type { User } from "@/types/api";
import { AdminOverview } from "./admin-overview";
import { BannerManager } from "./banner-manager";
import { OrderSNFulfillment } from "./order-sn-fulfillment";

export function AdminLayout() {
  const location = useLocation();
  const pathname = location.pathname;
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const setAuthOpen = useUIStore((state) => state.setAuthOpen);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleAdminQuickLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await apiClient<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "admin@auratech.co.th",
          password: "password123",
        }),
      });
      setAuth(res.data.user, res.data.token);
    } catch (err) {
      setLoginError((err as Error).message || "Failed to sign in as Administrator");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Top Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
                Backoffice Operations Console
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Admin
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              AURA TECH Inventory, Campaigns & Serial Number Logistics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Logged in as {user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => clearAuth()}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : isRestoring ? (
            <span className="text-xs text-zinc-500">Restoring session…</span>
          ) : DEMO_MODE && (
            <button
              type="button"
              onClick={handleAdminQuickLogin}
              disabled={isLoggingIn}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isLoggingIn ? "Signing In..." : "1-Click Admin Sign-In"}</span>
            </button>
          )}

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Exit to Storefront</span>
          </Link>
        </div>
      </div>

      {!isAdmin && !isRestoring && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {user
                ? `You are signed in as ${user.email}, which is not an admin account.`
                : "Sign in with an admin account to use the backoffice."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
          >
            {user ? "Switch Account" : "Sign In"}
          </button>
        </div>
      )}

      {loginError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400">
          {loginError}
        </div>
      )}

      {/* Backoffice tabs and data are rendered for admins only. */}
      {isAdmin && (
        <>
          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 overflow-x-auto">
            <Link
              to="/admin"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                pathname === "/admin"
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview & Low Stock</span>
            </Link>

            <Link
              to="/admin"
              search={{ tab: "banners" }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                location.searchStr.includes("tab=banners")
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Dynamic Banners</span>
            </Link>

            <Link
              to="/admin"
              search={{ tab: "orders" }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                location.searchStr.includes("tab=orders")
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Order S/N Fulfillment</span>
            </Link>
          </div>

          {/* Tab Switcher Content */}
          <div className="pt-2">
            {location.searchStr.includes("tab=banners") ? (
              <BannerManager />
            ) : location.searchStr.includes("tab=orders") ? (
              <OrderSNFulfillment />
            ) : (
              <AdminOverview />
            )}
          </div>
        </>
      )}
    </div>
  );
}
