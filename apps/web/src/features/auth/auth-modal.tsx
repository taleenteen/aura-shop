import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Mail, Lock, User as UserIcon, Phone, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import type { AuthResponse } from "@/types/api";
import { DEMO_MODE } from "@/lib/demo-mode";
import { ForgotPasswordPanel } from "./forgot-password-panel";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "register" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const queryClient = useQueryClient();
  const setAuth = useAuthStore((state) => state.setAuth);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const loadWishlist = useWishlistStore((state) => state.loadWishlist);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setPhone("");
    setError(null);
    setSuccessMsg(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFillDemoCustomer = () => {
    setMode("signin");
    setEmail("demo@auratech.co.th");
    setPassword("password123");
    setError(null);
  };

  const handleFillDemoAdmin = () => {
    setMode("signin");
    setEmail("admin@auratech.co.th");
    setPassword("password123");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === "signin") {
      if (!email.trim() || !password) {
        setError("Please enter your email and password.");
        return;
      }
    } else {
      if (!fullName.trim() || !email.trim() || !password) {
        setError("Please complete all required fields.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setIsLoading(true);
    try {
      let res: { data: AuthResponse };
      if (mode === "signin") {
        res = await apiClient<AuthResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });
      } else {
        res = await apiClient<AuthResponse>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            full_name: fullName.trim(),
            phone: phone.trim() || "080-000-0000",
          }),
        });
      }

      setAuth(res.data.user, res.data.token);
      setSuccessMsg(
        mode === "signin"
          ? `Welcome back, ${res.data.user.full_name}!`
          : `Account created successfully! Welcome to AURA TECH.`
      );

      // Invalidate queries & sync stores so guest items merge visually
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      await Promise.all([fetchCart(), loadWishlist()]);

      // Auto close after brief celebration
      setTimeout(() => {
        handleClose();
      }, 700);
    } catch (err) {
      setError((err as Error).message || "Authentication failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl z-10"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {mode === "forgot" ? (
              <ForgotPasswordPanel
                initialEmail={email}
                onBack={() => setMode("signin")}
                onLeave={handleClose}
              />
            ) : (
            <>
            {/* Header Badge & Title */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 mb-3 shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
                {mode === "signin" ? "Sign In to AURA TECH" : "Create Your Account"}
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Your guest bag and wishlist will seamlessly sync upon sign-in.
              </p>
            </div>

            {/* Mode Tabs */}
            <div className="flex p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800/70 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`relative flex-1 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  mode === "signin"
                    ? "text-zinc-950 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
              >
                {mode === "signin" && (
                  <motion.div
                    layoutId="auth-tab-pill"
                    className="absolute inset-0 bg-white dark:bg-zinc-900 rounded-xl shadow-xs"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`relative flex-1 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  mode === "register"
                    ? "text-zinc-950 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
              >
                {mode === "register" && (
                  <motion.div
                    layoutId="auth-tab-pill"
                    className="absolute inset-0 bg-white dark:bg-zinc-900 rounded-xl shadow-xs"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">Create Account</span>
              </button>
            </div>

            {/* Error & Success Alerts */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5 text-xs text-rose-600 dark:text-rose-400"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Somchai Techlover"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-all"
                  />
                </div>
              </div>

              {mode === "register" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="089-123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Password
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                      }}
                      className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-all"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-md"
              >
                {isLoading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <span>{mode === "signin" ? "Sign In" : "Create Account"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Helper Section (demo builds only) */}
            {DEMO_MODE && (
            <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-2.5">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-zinc-400">
                  Quick Demo Sign-In
                </span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Pre-Seeded Roles
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleFillDemoCustomer}
                  className="px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 text-left transition-colors cursor-pointer"
                >
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">Customer</p>
                  <p className="text-[10px] text-zinc-500 truncate">demo@auratech.co.th</p>
                </button>

                <button
                  type="button"
                  onClick={handleFillDemoAdmin}
                  className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-left transition-colors cursor-pointer"
                >
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Admin</p>
                  <p className="text-[10px] text-zinc-500 truncate">admin@auratech.co.th</p>
                </button>
              </div>
            </div>
            )}
            </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
