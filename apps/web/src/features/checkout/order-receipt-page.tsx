import { isFlagSet } from "@/lib/search-params";
import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Clock, Inbox, Loader2, Mail, Package, ShieldCheck, ShoppingBag, Truck, XCircle, type LucideIcon } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { orderAccessHeaders } from "@/lib/order-access";
import { formatTHB } from "@/lib/currency";
import { useUIStore } from "@/stores/ui-store";
import type { EmailMessage, Order } from "@/types/api";
import { STATUS_META, STEPS, STEP_REACHED, formatTime, isPayable } from "@/features/orders/order-status";
import { CancelOrderButton } from "@/features/orders/cancel-order-button";
import { EmailRow, EmailViewer } from "@/features/orders/email-viewer";
import { ParcelTracking } from "@/features/orders/parcel-tracking";
import { carrierName } from "@/features/orders/carriers";

interface OrderReceiptPageProps {
  orderNumber: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  PROMPTPAY_QR: "PromptPay",
  CREDIT_CARD: "Credit card",
  INSTALLMENT_0: "0% installment",
};

interface Hero {
  icon: LucideIcon;
  tone: string;
  title: string;
  body: React.ReactNode;
}

export function OrderReceiptPage({ orderNumber }: OrderReceiptPageProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openEmail, setOpenEmail] = useState<EmailMessage | null>(null);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const [trackOpen, setTrackOpen] = useState(isFlagSet(search.track));
  useEffect(() => {
    if (isFlagSet(search.track)) setTrackOpen(true);
  }, [search.track]);
  const setCartOpen = useUIStore((s) => s.setCartOpen);

  const loadEmails = useCallback(
    () =>
      apiClient<EmailMessage[]>(`/orders/${orderNumber}/emails`, { headers: orderAccessHeaders(orderNumber) })
        .then((res) => setEmails(res.data || []))
        .catch(() => setEmails([])),
    [orderNumber]
  );

  useEffect(() => {
    setIsLoading(true);
    apiClient<Order>(`/orders/${orderNumber}`, { headers: orderAccessHeaders(orderNumber) })
      .then((res) => {
        setOrder(res.data);
        return loadEmails();
      })
      .catch(() => setOrder(null))
      .finally(() => setIsLoading(false));
  }, [orderNumber, loadEmails]);

  if (isLoading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs">Loading your order…</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-32 max-w-lg mx-auto text-center px-4 space-y-3">
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">We couldn't open this order</h1>
        <p className="text-sm text-zinc-500">
          Order {orderNumber} was placed from another browser or account. Look it up with the email you ordered with.
        </p>
        <Link
          to="/orders/lookup"
          search={{ order: orderNumber }}
          className="inline-block mt-3 px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-sm font-semibold"
        >
          Find my order
        </Link>
      </div>
    );
  }

  const latest = emails[0];
  const cancelReason = emails.find((e) => e.kind === "ORDER_CANCELLED")?.data?.reason;
  const payable = isPayable(order);
  const isPaid = !["PENDING_PAYMENT", "CANCELLED"].includes(order.status);
  const reached = STEP_REACHED[order.status];
  const meta = STATUS_META[order.status];
  const address = order.shipping_address;

  const emailLink = latest && (
    <button type="button" onClick={() => setOpenEmail(latest)} className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2 cursor-pointer">
      View email
    </button>
  );

  const hero: Hero = (() => {
    switch (order.status) {
      case "PENDING_PAYMENT":
        return payable
          ? {
              icon: Clock,
              tone: "bg-amber-500/10 text-amber-600 border-amber-500/20",
              title: "Complete your payment",
              body: <>Your items are held for you until <strong className="text-zinc-900 dark:text-white">{formatTime(order.reservation_expires_at)}</strong>. Pay before then to confirm the order.</>,
            }
          : {
              icon: Clock,
              tone: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
              title: "Payment window closed",
              body: "We didn't receive payment within 15 minutes, so the hold on these items is being released.",
            };
      case "CANCELLED":
        return {
          icon: XCircle,
          tone: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
          title: cancelReason === "expired" ? "Payment window closed" : "Order cancelled",
          body:
            cancelReason === "store" || !cancelReason ? (
              <>This order was cancelled. Any payment will be refunded in full within 7 business days.</>
            ) : (
              <>Nothing was charged, and the items are back in your bag.</>
            ),
        };
      case "SHIPPED":
        return {
          icon: Truck,
          tone: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
          title: "Your order is on the way",
          body: <>It's with our express courier. We emailed the details to <strong className="text-zinc-900 dark:text-white">{order.customer_email}</strong>. {emailLink}</>,
        };
      case "DELIVERED":
        return {
          icon: CheckCircle2,
          tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
          title: "Delivered",
          body: "Your order has arrived. Warranty is registered to the serial numbers below.",
        };
      default:
        return {
          icon: CheckCircle2,
          tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
          title: "Thank you for your order!",
          body: <>Payment received. A confirmation has been sent to <strong className="text-zinc-900 dark:text-white">{order.customer_email}</strong>. {emailLink}</>,
        };
    }
  })();
  const HeroIcon = hero.icon;

  const onCancelled = (updated: Order) => {
    setOrder({ ...updated, viewer_can_manage: true });
    loadEmails();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="text-center space-y-4 mb-10">
        <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto ${hero.tone}`}>
          <HeroIcon className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 dark:text-white">{hero.title}</h1>
        <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">{hero.body}</p>

        {order.viewer_can_manage && payable && (
          <div className="flex flex-wrap justify-center items-center gap-3 pt-1">
            <Link
              to="/checkout"
              search={{ order: order.order_number }}
              className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold hover:opacity-90"
            >
              Complete payment
            </Link>
            <CancelOrderButton orderNumber={order.order_number} onCancelled={onCancelled} />
          </div>
        )}
        {order.viewer_can_manage && order.status === "CANCELLED" && (cancelReason === "customer" || cancelReason === "expired") && (
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold hover:opacity-90 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            Open my bag
          </button>
        )}
      </div>

      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Order number</div>
            <div className="text-xl font-mono font-bold text-zinc-950 dark:text-white">{order.order_number}</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Placed {new Date(order.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <span className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${meta.tone}`}>
            <meta.icon className="w-3.5 h-3.5" aria-hidden />
            {meta.label}
          </span>
        </div>

        {reached >= 0 && (
          <ol className="flex items-center gap-1.5" aria-label={`Progress: ${STEPS[reached]}`}>
            {STEPS.map((step, i) => (
              <li key={step} className="flex-1 min-w-0">
                <div className={`h-1.5 rounded-full ${i <= reached ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"}`} />
                <span className={`mt-1 block truncate text-[10px] ${i <= reached ? "text-zinc-700 dark:text-zinc-300 font-semibold" : "text-zinc-400"}`}>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {order.tracking_number && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Truck className="w-5 h-5 text-indigo-500 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">
                  Shipped with {carrierName(order.carrier)}
                  {order.shipped_at && ` on ${new Date(order.shipped_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                </p>
                <p className="font-mono font-bold text-sm text-zinc-950 dark:text-white tracking-wide truncate">{order.tracking_number}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTrackOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:opacity-90 cursor-pointer"
            >
              Track parcel
            </button>
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Items</h2>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
            {order.items?.map((item) => (
              <div key={item.id} className="py-4 first:pt-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white">{item.name_snapshot}</h3>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {item.spec_summary} • Qty: {item.quantity}
                    </div>
                    {item.serial_numbers?.some(Boolean) ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.serial_numbers.filter(Boolean).map((sn) => (
                          <div key={sn} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[11px] font-mono font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>S/N: {sn}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      isPaid && <div className="text-[11px] text-zinc-400 mt-1">Serial numbers are recorded when your order is packed.</div>
                    )}
                  </div>
                </div>
                <div className="font-bold text-sm text-zinc-950 dark:text-white shrink-0">{formatTHB(item.unit_price * item.quantity)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 grid gap-6 sm:grid-cols-2">
          {address && (
            <div className="text-xs text-zinc-500 leading-relaxed">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Delivery</h2>
              <p className="font-semibold text-zinc-900 dark:text-white">{address.recipient_name}</p>
              <p>{address.phone}</p>
              <p>{[address.address_line_1, address.district, address.province, address.postal_code].filter(Boolean).join(", ")}</p>
            </div>
          )}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>{formatTHB(order.subtotal_amount)}</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>Shipping</span>
              <span className="text-emerald-600 font-semibold">Free Express</span>
            </div>
            <div className="flex justify-between gap-4 text-base font-black text-zinc-950 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span>{isPaid ? `Paid by ${PAYMENT_LABEL[order.payment_method] ?? order.payment_method}` : "Total"}</span>
              <span>{formatTHB(order.grand_total)}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden" aria-labelledby="order-emails">
        <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
          <Inbox className="w-4 h-4 text-zinc-400" aria-hidden />
          <h2 id="order-emails" className="text-sm font-bold text-zinc-950 dark:text-white">Emails about this order</h2>
          <span className="ml-auto text-[11px] text-zinc-400 truncate">to {order.customer_email}</span>
        </div>
        {emails.length === 0 ? (
          <p className="px-5 py-6 text-xs text-zinc-500 flex items-center gap-2">
            <Mail className="w-4 h-4 text-zinc-300" aria-hidden />
            We'll email you when your payment is confirmed and when your order ships.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {emails.map((email) => (
              <li key={email.id}>
                <EmailRow email={email} onOpen={() => setOpenEmail(email)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex justify-center">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 transition-opacity shadow-md"
        >
          <span>Continue Shopping</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {openEmail && <EmailViewer email={openEmail} order={order} onClose={() => setOpenEmail(null)} />}
      {trackOpen && order.tracking_number && <ParcelTracking order={order} onClose={() => setTrackOpen(false)} />}
    </div>
  );
}
