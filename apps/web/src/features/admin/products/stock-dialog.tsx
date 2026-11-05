import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import type { StockAdjustmentResult, StockMovement, StockReason } from "@/types/api";

const REASON_LABEL: Record<StockReason, string> = {
  INITIAL: "Opening stock",
  RECEIVE: "Received from supplier",
  COUNT: "Stock count correction",
  DAMAGE: "Damaged or lost",
  RETURN: "Customer return",
  SALE: "Sold",
  CANCEL_RESTOCK: "Order cancelled, restocked",
};
const MANUAL_REASONS: StockReason[] = ["RECEIVE", "RETURN", "DAMAGE", "COUNT"];

interface Props {
  variantId: string;
  sku: string;
  stock: number;
  reserved: number;
  onClose: () => void;
  onChanged: (stock: number, reserved: number) => void;
}

export function StockDialog({ variantId, sku, stock: initialStock, reserved: initialReserved, onClose, onChanged }: Props) {
  const [stock, setStock] = useState(initialStock);
  const [reserved, setReserved] = useState(initialReserved);
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<StockReason>("RECEIVE");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [history, setHistory] = useState<StockMovement[] | null>(null);

  const loadHistory = () =>
    apiClient<StockMovement[]>(`/admin/variants/${variantId}/stock-movements`)
      .then((r) => setHistory(r.data || []))
      .catch(() => setHistory([]));

  useEffect(() => {
    loadHistory();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId]);

  // Write-offs remove stock; a count sets it; receipts and returns add it.
  useEffect(() => {
    if (reason === "COUNT") setMode("set");
    else if (mode === "set") setMode("delta");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const n = Math.floor(Number(quantity));
  const valid = quantity !== "" && Number.isFinite(n);
  const delta = !valid ? 0 : mode === "set" ? n - stock : reason === "DAMAGE" ? -Math.abs(n) : Math.abs(n);
  const after = stock + delta;
  const problem =
    !valid ? null : after < 0 ? "Stock cannot go below zero." : after < reserved ? `${reserved} unit(s) are held in checkout; stock cannot go below ${reserved}.` : delta === 0 ? "This would not change the stock." : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || problem) return;
    setIsSaving(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await apiClient<StockAdjustmentResult>(`/admin/variants/${variantId}/stock-adjustments`, {
        method: "POST",
        body: JSON.stringify({ mode, quantity: mode === "set" ? n : delta, reason, note, expected_stock: stock }),
      });
      setStock(res.data.stock_quantity);
      setReserved(res.data.reserved_stock);
      onChanged(res.data.stock_quantity, res.data.reserved_stock);
      setQuantity("");
      setNote("");
      setMessage({ kind: "ok", text: `Stock is now ${res.data.stock_quantity} (${res.data.delta > 0 ? "+" : ""}${res.data.delta}).` });
      loadHistory();
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setErrors(apiErr.fields ?? {});
      setMessage({ kind: "error", text: apiErr.message || "Could not update stock." });
      if (apiErr.code === "STOCK_CHANGED") {
        // Someone else changed it: show the current figures before letting them retry.
        apiClient<StockMovement[]>(`/admin/variants/${variantId}/stock-movements`).then((r) => {
          const latest = r.data?.[0];
          if (latest) {
            setStock(latest.stock_after);
            onChanged(latest.stock_after, reserved);
          }
          setHistory(r.data || []);
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const fieldCls = "w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Stock for ${sku}`}>
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl p-6 space-y-5" data-lenis-prevent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-950 dark:text-white">Stock</h3>
            <p className="text-xs font-mono text-zinc-500">{sku}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["In stock", stock],
            ["Held in checkout", reserved],
            ["Available", stock - reserved],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 py-3">
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</dt>
              <dd className="text-xl font-black text-zinc-950 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="stock-reason" className="block text-xs font-semibold mb-1">Reason</label>
            <select id="stock-reason" value={reason} onChange={(e) => setReason(e.target.value as StockReason)} className={fieldCls}>
              {MANUAL_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
            {errors.reason && <p className="mt-1 text-[11px] text-rose-600">{errors.reason}</p>}
          </div>
          <div>
            <label htmlFor="stock-qty" className="block text-xs font-semibold mb-1">
              {mode === "set" ? "Counted units on the shelf" : reason === "DAMAGE" ? "Units to write off" : "Units to add"}
            </label>
            <input id="stock-qty" type="number" min={0} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={fieldCls} />
            {valid && (
              <p className={`mt-1 text-[11px] ${problem ? "text-rose-600" : "text-zinc-500"}`}>
                {problem ?? `In stock ${stock} → ${after} (${delta > 0 ? "+" : ""}${delta})`}
              </p>
            )}
            {errors.quantity && <p className="mt-1 text-[11px] text-rose-600">{errors.quantity}</p>}
          </div>
          <div>
            <label htmlFor="stock-note" className="block text-xs font-semibold mb-1">
              Note {reason === "DAMAGE" || reason === "COUNT" ? "" : <span className="font-normal text-zinc-400">(optional)</span>}
            </label>
            <input id="stock-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === "RECEIVE" ? "PO / delivery reference" : "What happened?"} className={fieldCls} />
            {errors.note && <p className="mt-1 text-[11px] text-rose-600">{errors.note}</p>}
          </div>
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={`text-xs font-semibold ${message.kind === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
              {message.text}
            </p>
          )}
          <button type="submit" disabled={!valid || !!problem || isSaving} className="w-full py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold disabled:opacity-40 cursor-pointer">
            {isSaving ? "Updating…" : "Update stock"}
          </button>
        </form>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">History</h4>
          {history === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : history.length === 0 ? (
            <p className="text-xs text-zinc-500">No stock changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {history.map((m) => (
                <li key={m.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-white">{REASON_LABEL[m.reason] ?? m.reason}</p>
                    <p className="text-zinc-500 truncate">
                      {new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.actor_email && ` · ${m.actor_email}`}
                      {m.note && ` · ${m.note}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold ${m.delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</p>
                    <p className="text-zinc-400">→ {m.stock_after}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
