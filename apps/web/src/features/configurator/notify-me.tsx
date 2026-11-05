import { useEffect, useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useStockAlertStore } from "@/stores/stock-alert-store";
import { useUIStore } from "@/stores/ui-store";

/** Shown instead of "Add to Bag" when the selected option is out of stock. */
export function NotifyMe({ variantId }: { variantId: string }) {
  const user = useAuthStore((s) => s.user);
  const setAuthOpen = useUIStore((s) => s.setAuthOpen);
  const { alerts, loaded, load, subscribe, unsubscribe } = useStockAlertStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = alerts.some((a) => a.variant_id === variantId);

  useEffect(() => {
    if (user && !loaded) load();
  }, [user, loaded, load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => setAuthOpen(true)}
        className="w-full py-4 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-white text-zinc-950 hover:bg-zinc-100 cursor-pointer"
      >
        <BellRing className="w-4 h-4" />
        Sign in to get notified when it's back
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {waiting ? (
        <div className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            We'll email {user.email} when it's back
          </span>
          <button type="button" disabled={busy} onClick={() => run(() => unsubscribe(variantId))} className="text-xs font-semibold text-zinc-300 hover:text-white underline underline-offset-2 cursor-pointer shrink-0">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => subscribe(variantId))}
          className="w-full py-4 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-white text-zinc-950 hover:bg-zinc-100 disabled:opacity-60 cursor-pointer"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
          Email me when it's back
        </button>
      )}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
