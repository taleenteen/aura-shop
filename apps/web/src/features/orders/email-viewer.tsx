import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { formatTHB } from "@/lib/currency";
import { useUIStore } from "@/stores/ui-store";
import type { EmailMessage, Order } from "@/types/api";

const PAYMENT_LABEL: Record<string, string> = {
  PROMPTPAY_QR: "PromptPay",
  CREDIT_CARD: "Credit card",
  INSTALLMENT_0: "0% installment",
};

export const formatEmailDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface Copy {
  headline: string;
  intro: string;
  cta: { label: string; action: "order" | "bag" | "catalog" };
  showItems: boolean;
  showSerials: boolean;
  showAddress: boolean;
}

function emailCopy(email: EmailMessage, order: Order): Copy {
  const name = order.shipping_address?.recipient_name?.split(" ")[0] || "there";
  switch (email.kind) {
    case "ORDER_CONFIRMED":
      return {
        headline: "Thanks for your order",
        intro: `Hi ${name}, we've received your payment and your order is being prepared. We'll email you again as soon as it ships.`,
        cta: { label: "View your order", action: "order" },
        showItems: true,
        showSerials: false,
        showAddress: true,
      };
    case "ORDER_SHIPPED":
      return {
        headline: "Your order is on the way",
        intro: `Hi ${name}, your parcel has left our warehouse with our express courier. Keep the serial numbers below for warranty service.`,
        cta: { label: "Track your order", action: "order" },
        showItems: true,
        showSerials: true,
        showAddress: true,
      };
    case "ORDER_DELIVERED":
      return {
        headline: "Your order has arrived",
        intro: `Hi ${name}, your order has been delivered. Your warranty starts today and is registered to the serial numbers below.`,
        cta: { label: "View order & warranty", action: "order" },
        showItems: true,
        showSerials: true,
        showAddress: false,
      };
    case "ORDER_CANCELLED": {
      const reason = email.data?.reason;
      if (reason === "expired") {
        return {
          headline: "We didn't receive your payment",
          intro: `Hi ${name}, we hold items for 15 minutes while you pay. That time ran out, so we released the hold and put everything back in your bag. You can check out again whenever you're ready.`,
          cta: { label: "Return to your bag", action: "bag" },
          showItems: true,
          showSerials: false,
          showAddress: false,
        };
      }
      if (reason === "customer") {
        return {
          headline: "Your order has been cancelled",
          intro: `Hi ${name}, as requested we've cancelled this order. Nothing was charged, and the items are back in your bag.`,
          cta: { label: "Return to your bag", action: "bag" },
          showItems: true,
          showSerials: false,
          showAddress: false,
        };
      }
      return {
        headline: "Your order has been cancelled",
        intro: `Hi ${name}, we've cancelled this order. Any payment will be refunded in full to your original payment method within 7 business days.`,
        cta: { label: "Continue shopping", action: "catalog" },
        showItems: true,
        showSerials: false,
        showAddress: false,
      };
    }
  }
}

interface Props {
  email: EmailMessage;
  order: Order;
  onClose: () => void;
}

/** Shows one customer email the way a mail client would. */
export function EmailViewer({ email, order, onClose }: Props) {
  const navigate = useNavigate();
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const copy = emailCopy(email, order);
  const address = order.shipping_address;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const followCta = () => {
    onClose();
    if (copy.cta.action === "bag") setCartOpen(true);
    else if (copy.cta.action === "catalog") navigate({ to: "/catalog" });
    else {
      navigate({ to: "/orders/$orderNumber", params: { orderNumber: order.order_number } });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={email.subject}>
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
        data-lenis-prevent
      >
        {/* Mail client header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white leading-snug">{email.subject}</h2>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center text-xs font-black shrink-0">
              A
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <p className="text-zinc-900 dark:text-white">
                <span className="font-semibold">AURA Tech</span>{" "}
                <span className="text-zinc-500">&lt;orders@auratech.co.th&gt;</span>
              </p>
              <p className="text-zinc-500 truncate">to {email.recipient}</p>
            </div>
            <time dateTime={email.sent_at} className="text-[11px] text-zinc-500 shrink-0">
              {formatEmailDate(email.sent_at)}
            </time>
          </div>
        </div>

        {/* Email body: emails render on a light canvas regardless of the site theme */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-zinc-100 dark:bg-zinc-950 p-3 sm:p-6">
          <article className="mx-auto max-w-xl bg-white text-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <header className="px-6 sm:px-8 py-5 bg-zinc-950 text-white flex items-center justify-between">
              <span className="font-black tracking-[0.2em] text-sm">AURA TECH</span>
              <span className="text-[11px] text-zinc-400 font-mono">{order.order_number}</span>
            </header>

            <div className="px-6 sm:px-8 py-7 space-y-6">
              <div className="space-y-3">
                <h3 className="text-2xl font-black tracking-tight text-zinc-950">{copy.headline}</h3>
                <p className="text-sm leading-relaxed text-zinc-600">{copy.intro}</p>
              </div>

              <button
                type="button"
                onClick={followCta}
                className="inline-block px-6 py-3 rounded-full bg-zinc-950 text-white text-sm font-bold hover:bg-zinc-800 cursor-pointer"
              >
                {copy.cta.label}
              </button>

              {copy.showItems && (
                <table className="w-full text-sm border-t border-zinc-200">
                  <tbody>
                    {order.items?.map((item) => {
                      const serials = (item.serial_numbers ?? []).filter(Boolean);
                      return (
                        <tr key={item.id} className="border-b border-zinc-100 align-top">
                          <td className="py-3 pr-3">
                            <p className="font-semibold text-zinc-950">{item.name_snapshot}</p>
                            <p className="text-xs text-zinc-500">
                              {item.spec_summary} • Qty {item.quantity}
                            </p>
                            {copy.showSerials && serials.length > 0 && (
                              <p className="mt-1 text-[11px] font-mono text-emerald-700">S/N {serials.join(", ")}</p>
                            )}
                          </td>
                          <td className="py-3 text-right font-semibold text-zinc-950 whitespace-nowrap">
                            {formatTHB(item.unit_price * item.quantity)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="pt-3 text-zinc-500">Shipping</td>
                      <td className="pt-3 text-right text-emerald-700 font-semibold">Free</td>
                    </tr>
                    <tr>
                      <td className="pt-1 font-black text-zinc-950">
                        Total{email.kind === "ORDER_CANCELLED" ? "" : ` (${PAYMENT_LABEL[order.payment_method] ?? order.payment_method})`}
                      </td>
                      <td className="pt-1 text-right font-black text-zinc-950">{formatTHB(order.grand_total)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {copy.showAddress && address && (
                <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 leading-relaxed">
                  <p className="font-bold text-zinc-950 mb-1">Delivering to</p>
                  <p>{address.recipient_name} • {address.phone}</p>
                  <p>{[address.address_line_1, address.district, address.province, address.postal_code].filter(Boolean).join(", ")}</p>
                </div>
              )}
            </div>

            <footer className="px-6 sm:px-8 py-5 border-t border-zinc-100 text-[11px] text-zinc-400 leading-relaxed space-y-1">
              <p>Questions about your order? Reply to this email, write to support@auratech.co.th or call 02-118-9999 (09:00–21:00).</p>
              <p>© {new Date(email.sent_at).getFullYear()} AURA TECH CO., LTD.</p>
            </footer>
          </article>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A compact row for an inbox-style list of emails. */
export function EmailRow({ email, onOpen }: { email: EmailMessage; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
    >
      <Mail className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{email.subject}</span>
        <span className="block text-xs text-zinc-500 truncate">{email.preheader}</span>
      </span>
      <time dateTime={email.sent_at} className="text-[11px] text-zinc-400 shrink-0">
        {new Date(email.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </time>
    </button>
  );
}
