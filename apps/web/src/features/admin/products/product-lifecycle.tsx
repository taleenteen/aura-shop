import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, Loader2, Trash2, X } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";

export const archiveProduct = (id: string) => apiClient(`/admin/products/${id}/archive`, { method: "POST" });
export const restoreProduct = (id: string) => apiClient(`/admin/products/${id}/restore`, { method: "POST" });
const deleteProduct = (id: string) => apiClient(`/admin/products/${id}`, { method: "DELETE" });

export type LifecycleAction = "archive" | "delete";

interface Props {
  action: LifecycleAction;
  product: { id: string; name: string };
  onClose: () => void;
  /** Called after the product was archived or deleted, with what actually happened. */
  onDone: (result: LifecycleAction) => void;
}

/**
 * Confirms archiving or deleting a product. Archiving is reversible, so one click confirms it.
 * Deleting is not: the admin types the product name first. A product that is on orders can't
 * be deleted; the dialog then offers to archive it instead.
 */
export function ProductLifecycleDialog({ action: initialAction, product, onClose, onDone }: Props) {
  const [action, setAction] = useState(initialAction);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const nameMatches = typed.trim() === product.name.trim();

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action === "archive") await archiveProduct(product.id);
      else await deleteProduct(product.id);
      onDone(action);
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setError(apiErr.message || `Could not ${action} the product.`);
      // Sold before: deleting would break order history, so switch the dialog to archiving.
      if (apiErr.code === "PRODUCT_HAS_ORDERS") setAction("archive");
    } finally {
      setBusy(false);
    }
  };

  const isDelete = action === "delete";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifecycle-title"
        className="relative w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4"
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDelete ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600"}`}>
            {isDelete ? <Trash2 className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
          </span>
          <h3 id="lifecycle-title" className="text-base font-bold text-zinc-950 dark:text-white pr-6">
            {isDelete ? "Delete" : "Archive"} “{product.name}”?
          </h3>
        </div>

        {isDelete ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
            <p>
              This removes the product and its options for good, together with bag items, wishlist hearts, stock alerts and stock history.{" "}
              <strong>It can&apos;t be undone.</strong>
            </p>
            <p>Products that have been ordered can&apos;t be deleted, so order history and sales reports stay complete.</p>
          </div>
        ) : (
          <ul className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5 list-disc pl-4">
            <li>Taken off sale and hidden from the store.</li>
            <li>Moved out of the product list into the Archived tab.</li>
            <li>Orders, sales reports and stock history keep it. You can restore it at any time.</li>
          </ul>
        )}

        {error && (
          <p role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}

        {isDelete && (
          <div>
            <label htmlFor="lifecycle-confirm" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Type <span className="font-mono select-all">{product.name}</span> to confirm
            </label>
            <input
              id="lifecycle-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy || (isDelete && !nameMatches)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
              isDelete ? "bg-rose-600 hover:bg-rose-700" : "bg-zinc-950 dark:bg-white dark:text-zinc-950 hover:opacity-90"
            }`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isDelete ? "Delete permanently" : "Archive product"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
