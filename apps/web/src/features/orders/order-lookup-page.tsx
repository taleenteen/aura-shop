import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, PackageSearch } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { rememberOrderLookup } from "@/lib/order-access";
import { useAuthStore } from "@/stores/auth-store";
import type { Order } from "@/types/api";

/** Find an order by number and email: for guest checkouts, or orders placed on another device. */
export function OrderLookupPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const [orderNumber, setOrderNumber] = useState(typeof search.order === "string" ? search.order : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await apiClient<Order>("/orders/lookup", {
        method: "POST",
        body: JSON.stringify({ order_number: orderNumber.trim(), email: email.trim() }),
      });
      rememberOrderLookup(res.data.order_number, email.trim());
      navigate({ to: "/orders/$orderNumber", params: { orderNumber: res.data.order_number } });
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setErrors(apiErr.fields ?? {});
      setMessage(apiErr.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white";

  return (
    <div className="max-w-md mx-auto w-full px-4 py-16 sm:py-24">
      <div className="text-center space-y-3 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto">
          <PackageSearch className="w-7 h-7 text-zinc-700 dark:text-zinc-200" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">Track your order</h1>
        <p className="text-sm text-zinc-500">
          Enter the order number from your confirmation email and the email address you ordered with.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 shadow-xs">
        <div>
          <label htmlFor="lookup-order" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Order number
          </label>
          <input
            id="lookup-order"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="AURA-20261105-7KQ2M9XA"
            autoComplete="off"
            spellCheck={false}
            className={`${field} font-mono`}
            aria-invalid={!!errors.order_number}
          />
          {errors.order_number && <p className="mt-1 text-[11px] text-rose-600">{errors.order_number}</p>}
        </div>
        <div>
          <label htmlFor="lookup-email" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Email
          </label>
          <input
            id="lookup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={field}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="mt-1 text-[11px] text-rose-600">{errors.email}</p>}
        </div>
        {message && !Object.keys(errors).length && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Find order
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-zinc-500">
        {user ? (
          <>
            Signed in? All your orders are in{" "}
            <Link to="/account" search={{ tab: "orders" }} className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2">
              My Orders
            </Link>
            .
          </>
        ) : (
          "Ordered while signed in? Sign in to see every order in your account."
        )}
      </p>
    </div>
  );
}
