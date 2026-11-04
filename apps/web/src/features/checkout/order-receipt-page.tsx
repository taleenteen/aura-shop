import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Package, ArrowRight, ShieldCheck, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { Order } from "@/types/api";
import { formatTHB } from "@/lib/currency";

interface OrderReceiptPageProps {
  orderNumber: string;
}

export function OrderReceiptPage({ orderNumber }: OrderReceiptPageProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient<Order>(`/orders/${orderNumber}`)
      .then((res) => {
        setOrder(res.data);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  }, [orderNumber]);

  if (isLoading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs">Retrieving order confirmation...</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-32 max-w-lg mx-auto text-center px-4">
        <h2 className="text-2xl font-bold text-zinc-950 dark:text-white">
          Order Not Found
        </h2>
        <p className="text-xs text-zinc-500 mt-2">
          Unable to locate order reference {orderNumber}.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-semibold"
        >
          Return to Storefront
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Success Hero Header */}
      <div className="text-center space-y-4 mb-12">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 dark:text-white">
          Thank you for your order!
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
          Your payment has been authorized and stock has been committed. A confirmation receipt has been sent to{" "}
          <strong className="text-zinc-900 dark:text-white">
            {order.customer_email}
          </strong>.
        </p>
      </div>

      {/* Order Meta Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Order Reference
            </div>
            <div className="text-xl font-mono font-bold text-zinc-950 dark:text-white">
              {order.order_number}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Status:
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {order.status}
            </span>
          </div>
        </div>

        {/* Purchased Items List with Serial Number display */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Hardware Items Allocated
          </h3>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
            {order.items?.map((item) => (
              <div
                key={item.id}
                className="py-4 first:pt-0 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white">
                      {item.name_snapshot}
                    </h4>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {item.spec_summary} • Qty: {item.quantity}
                    </div>
                    {item.serial_number ? (
                      <div className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[11px] font-mono font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>S/N: {item.serial_number}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-400 font-mono mt-1">
                        S/N Pending Fulfillment
                      </div>
                    )}
                  </div>
                </div>

                <div className="font-bold text-sm text-zinc-950 dark:text-white">
                  {formatTHB(item.unit_price * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Totals */}
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
          <div className="flex justify-between text-zinc-500">
            <span>Subtotal</span>
            <span>{formatTHB(order.subtotal_amount)}</span>
          </div>
          <div className="flex justify-between text-zinc-500">
            <span>Shipping</span>
            <span className="text-emerald-600 font-semibold">Free Express</span>
          </div>
          <div className="flex justify-between text-base font-black text-zinc-950 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <span>Total Paid ({order.payment_method})</span>
            <span>{formatTHB(order.grand_total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 transition-opacity shadow-md"
        >
          <span>Continue Shopping</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
