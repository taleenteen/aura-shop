import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useCartStore } from "@/stores/cart-store";
import type { Order } from "@/types/api";

/** Cancels an unpaid order; the API puts its items back in the bag, so the cart is refreshed. */
export async function cancelOrder(orderNumber: string): Promise<Order> {
  const res = await apiClient<Order>(`/orders/${orderNumber}/cancel`, { method: "POST" });
  await useCartStore.getState().fetchCart();
  return res.data;
}

interface Props {
  orderNumber: string;
  onCancelled: (order: Order) => void;
  className?: string;
}

/** "Cancel order" that asks for a second tap before cancelling. */
export function CancelOrderButton({ orderNumber, onCancelled, className = "" }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onCancelled(await cancelOrder(orderNumber));
    } catch (err) {
      setError((err as Error).message || "Could not cancel this order.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const base = "px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50";

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {confirming ? (
        <>
          <span className="text-xs text-zinc-600 dark:text-zinc-300">Cancel this order?</span>
          <button type="button" disabled={busy} onClick={run} className={`${base} bg-rose-600 text-white hover:bg-rose-500 inline-flex items-center gap-1.5`}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Yes, cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className={`${base} border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800`}
          >
            Keep order
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${base} border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800`}
        >
          Cancel order
        </button>
      )}
      {error && (
        <span role="alert" className="w-full text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </span>
  );
}
