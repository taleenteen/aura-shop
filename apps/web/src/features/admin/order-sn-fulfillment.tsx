import React, { useState } from "react";
import { Package, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { OrderStatus } from "@/types/api";

export function OrderSNFulfillment() {
  const [orderId, setOrderId] = useState("");
  const [targetStatus, setTargetStatus] = useState<OrderStatus>("SHIPPED");
  const [serialNumber, setSerialNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) {
      setErrorMsg("Please provide an order UUID.");
      return;
    }

    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const serialMap: Record<string, string> = {};
      // If S/N is provided, map it to the fulfillment payload
      if (serialNumber.trim()) {
        serialMap["primary"] = serialNumber.trim();
      }

      await apiClient<{ message: string; status: string }>(
        `/admin/orders/${orderId.trim()}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: targetStatus,
            serial_numbers: serialMap,
          }),
        }
      );

      setSuccessMsg(
        `Order ${orderId} successfully transitioned to ${targetStatus} with warranty S/N recorded.`
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "SERIAL_NUMBER_REQUIRED") {
        setErrorMsg(
          "ENFORCEMENT BLOCK: Serial Number (S/N) is mandatory before transitioning to SHIPPED."
        );
      } else {
        setErrorMsg((err as Error).message || "Failed to update order status");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
          Order State Machine & Serial Number (S/N) Fulfillment
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Mandatory S/N assignment enforcement prior to SHIPPED status transition.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-5 shadow-xs"
        >
          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Order UUID
            </label>
            <input
              type="text"
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              className="w-full px-3 py-2.5 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Target Order Status
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as OrderStatus)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            >
              <option value="PAID_PROCESSING">PAID_PROCESSING</option>
              <option value="SN_ASSIGNED">SN_ASSIGNED</option>
              <option value="SHIPPED">SHIPPED (Enforces Non-Empty S/N)</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Hardware Serial Number (S/N)
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">
                e.g. C02M4PRO9981
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                placeholder="C02M4PRO9981"
                className="w-full pl-10 pr-3 py-2.5 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <ShieldCheck className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400">
            ⚠️ <strong>State Machine Guard:</strong> Transitioning to <span className="font-semibold text-zinc-900 dark:text-white">SHIPPED</span> without entering a valid Serial Number will be rejected with <code className="font-mono text-rose-500">400 SERIAL_NUMBER_REQUIRED</code>.
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validating State Machine...</span>
              </>
            ) : (
              <span>Execute Order Transition</span>
            )}
          </button>
        </form>

        <div className="lg:col-span-5 p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Package className="w-4 h-4" />
            <span>Fulfillment State Rules</span>
          </div>

          <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <strong className="text-zinc-900 dark:text-white">1. PENDING_PAYMENT:</strong> Stock soft-locked for 15 minutes.
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <strong className="text-zinc-900 dark:text-white">2. PAID_PROCESSING:</strong> Stock deducted from inventory. Order queued for warehouse packing.
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <strong className="text-zinc-900 dark:text-white">3. SHIPPED:</strong> Requires physical barcode scan of serial number (S/N) for official warranty registration.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
