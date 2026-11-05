import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useUIStore } from "@/stores/ui-store";
import type { AuthResponse } from "@/types/api";
import { z } from "zod";
import { validate, password as passwordRule } from "@/lib/validation";

const resetSchema = z
  .object({ password: passwordRule, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match." });

/** Landing page of the reset link in the password reset email. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const token = typeof search.token === "string" ? search.token : "";
  const setAuth = useAuthStore((s) => s.setAuth);
  const setAuthOpen = useUIStore((s) => s.setAuthOpen);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const checked = validate(resetSchema, { password, confirm });
    if (!checked.ok) return setErrors(checked.fields);
    setErrors({});
    setBusy(true);
    try {
      const res = await apiClient<AuthResponse>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setAuth(res.data.user, res.data.token);
      await Promise.all([useCartStore.getState().fetchCart(), useWishlistStore.getState().loadWishlist()]);
      navigate({ to: "/account", search: { tab: "profile", reset: "1" }, replace: true });
    } catch (err) {
      const apiErr = err as ApiRequestError;
      if (apiErr.code === "RESET_LINK_INVALID") setLinkInvalid(true);
      else {
        setErrors(apiErr.fields ?? {});
        setMessage(apiErr.message || "We couldn't reset your password. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white";

  return (
    <div className="max-w-md mx-auto w-full px-4 py-16 sm:py-24">
      <div className="text-center space-y-3 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto">
          <KeyRound className="w-7 h-7 text-zinc-700 dark:text-zinc-200" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
          {linkInvalid ? "This link has expired" : "Choose a new password"}
        </h1>
        <p className="text-sm text-zinc-500">
          {linkInvalid
            ? "Reset links work once and expire after 30 minutes. Request a new one from the sign-in window."
            : "You'll be signed in as soon as it's saved."}
        </p>
      </div>

      {linkInvalid ? (
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="w-full py-3 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold hover:opacity-90 cursor-pointer"
        >
          Request a new link
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 shadow-xs">
          <div>
            <label htmlFor="reset-password" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              New password
            </label>
            <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} aria-invalid={!!errors.password} />
            {errors.password && <p className="mt-1 text-[11px] text-rose-600">{errors.password}</p>}
          </div>
          <div>
            <label htmlFor="reset-confirm" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Confirm new password
            </label>
            <input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} aria-invalid={!!errors.confirm} />
            {errors.confirm && <p className="mt-1 text-[11px] text-rose-600">{errors.confirm}</p>}
          </div>
          {message && (
            <p role="alert" className="text-xs text-rose-600">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save password & sign in
          </button>
        </form>
      )}
    </div>
  );
}
