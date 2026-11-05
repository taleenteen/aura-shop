import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { formatTHB } from "@/lib/currency";
import { useUIStore } from "@/stores/ui-store";
import type { EmailMessage, Order } from "@/types/api";
import { carrierName } from "./carriers";

const PAYMENT_LABEL: Record<string, string> = {
  PROMPTPAY_QR: "PromptPay",
  CREDIT_CARD: "Credit card",
  INSTALLMENT_0: "0% installment",
};

export const formatEmailDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Splits "AURA Tech <orders@auratech.co.th>" into its name and address. */
function parseSender(sender: string) {
  const m = sender.match(/^(.*?)\s*<(.+)>$/);
  return m ? { name: m[1], address: m[2] } : { name: sender, address: "" };
}

/** Mail-client chrome around one email: subject, sender, recipient, date, and the message. */
function EmailShell({ email, onClose, label, children }: { email: EmailMessage; onClose: () => void; label: string; children: ReactNode }) {
  const sender = parseSender(email.sender);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={email.subject}>
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden" data-lenis-prevent>
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} aria-label="Back" className="p-1.5 -ml-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white leading-snug">{email.subject}</h2>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center text-xs font-black shrink-0">A</div>
            <div className="min-w-0 flex-1 text-xs">
              <p className="text-zinc-900 dark:text-white">
                <span className="font-semibold">{sender.name}</span> {sender.address && <span className="text-zinc-500">&lt;{sender.address}&gt;</span>}
              </p>
              <p className="text-zinc-500 truncate">to {email.recipient}</p>
            </div>
            <time dateTime={email.sent_at} className="text-[11px] text-zinc-500 shrink-0">
              {formatEmailDate(email.sent_at)}
            </time>
          </div>
        </div>

        {/* Emails render on a light canvas regardless of the site theme */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-zinc-100 dark:bg-zinc-950 p-3 sm:p-6">
          <article className="mx-auto max-w-xl bg-white text-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <header className="px-6 sm:px-8 py-5 bg-zinc-950 text-white flex items-center justify-between gap-3">
              <span className="font-black tracking-[0.2em] text-sm">AURA TECH</span>
              <span className="text-[11px] text-zinc-400 font-mono truncate">{label}</span>
            </header>
            <div className="px-6 sm:px-8 py-7 space-y-6">{children}</div>
            <footer className="px-6 sm:px-8 py-5 border-t border-zinc-100 text-[11px] text-zinc-400 leading-relaxed space-y-1">
              <p>Questions? Reply to this email, write to support@auratech.co.th or call 02-118-9999 (09:00–21:00).</p>
              <p>© {new Date(email.sent_at).getFullYear()} AURA TECH CO., LTD.</p>
            </footer>
          </article>
        </div>
      </div>
    </div>,
    document.body
  );
}

const ctaClass = "inline-block px-6 py-3 rounded-full bg-zinc-950 text-white text-sm font-bold hover:bg-zinc-800 cursor-pointer";

interface Copy {
  headline: string;
  intro: string;
  cta: { label: string; action: "order" | "track" | "bag" | "catalog" };
  showSerials: boolean;
  showAddress: boolean;
  showShipment: boolean;
}

function orderCopy(email: EmailMessage, order: Order): Copy {
  const name = order.shipping_address?.recipient_name?.split(" ")[0] || "there";
  const base = { showSerials: false, showAddress: false, showShipment: false };
  switch (email.kind) {
    case "ORDER_SHIPPED":
      return {
        ...base,
        headline: "Your order is on the way",
        intro: `Hi ${name}, your parcel has left our warehouse with ${carrierName(order.carrier) || "our courier"}. Keep the serial numbers below for warranty service.`,
        cta: { label: "Track your parcel", action: "track" },
        showSerials: true,
        showAddress: true,
        showShipment: true,
      };
    case "ORDER_DELIVERED":
      return {
        ...base,
        headline: "Your order has arrived",
        intro: `Hi ${name}, your order has been delivered. Your warranty starts today and is registered to the serial numbers below.`,
        cta: { label: "View order & warranty", action: "order" },
        showSerials: true,
      };
    case "ORDER_CANCELLED": {
      const reason = email.data?.reason;
      if (reason === "expired" || reason === "customer") {
        return {
          ...base,
          headline: reason === "expired" ? "We didn't receive your payment" : "Your order has been cancelled",
          intro:
            reason === "expired"
              ? `Hi ${name}, we hold items for 15 minutes while you pay. That time ran out, so we released the hold and put everything back in your bag. You can check out again whenever you're ready.`
              : `Hi ${name}, as requested we've cancelled this order. Nothing was charged, and the items are back in your bag.`,
          cta: { label: "Return to your bag", action: "bag" },
        };
      }
      return {
        ...base,
        headline: "Your order has been cancelled",
        intro: `Hi ${name}, we've cancelled this order. Any payment will be refunded in full to your original payment method within 7 business days.`,
        cta: { label: "Continue shopping", action: "catalog" },
      };
    }
    default:
      return {
        ...base,
        headline: "Thanks for your order",
        intro: `Hi ${name}, we've received your payment and your order is being prepared. We'll email you again as soon as it ships.`,
        cta: { label: "View your order", action: "order" },
        showAddress: true,
      };
  }
}

/** An email about an order. */
export function EmailViewer({ email, order, onClose }: { email: EmailMessage; order: Order; onClose: () => void }) {
  const navigate = useNavigate();
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const copy = orderCopy(email, order);
  const address = order.shipping_address;

  const followCta = () => {
    onClose();
    const action = copy.cta.action;
    if (action === "bag") setCartOpen(true);
    else if (action === "catalog") navigate({ to: "/catalog" });
    else {
      navigate({ to: "/orders/$orderNumber", params: { orderNumber: order.order_number }, search: action === "track" ? { track: "1" } : {} });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <EmailShell email={email} onClose={onClose} label={order.order_number}>
      <div className="space-y-3">
        <h3 className="text-2xl font-black tracking-tight text-zinc-950">{copy.headline}</h3>
        <p className="text-sm leading-relaxed text-zinc-600">{copy.intro}</p>
      </div>

      {copy.showShipment && order.tracking_number && (
        <div className="rounded-xl border border-zinc-200 px-4 py-3 text-xs">
          <p className="text-zinc-500">{carrierName(order.carrier)} tracking number</p>
          <p className="mt-0.5 font-mono text-base font-bold text-zinc-950 tracking-wide">{order.tracking_number}</p>
        </div>
      )}

      <button type="button" onClick={followCta} className={ctaClass}>
        {copy.cta.label}
      </button>

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
                  {copy.showSerials && serials.length > 0 && <p className="mt-1 text-[11px] font-mono text-emerald-700">S/N {serials.join(", ")}</p>}
                </td>
                <td className="py-3 text-right font-semibold text-zinc-950 whitespace-nowrap">{formatTHB(item.unit_price * item.quantity)}</td>
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

      {copy.showAddress && address && (
        <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 leading-relaxed">
          <p className="font-bold text-zinc-950 mb-1">Delivering to</p>
          <p>
            {address.recipient_name} • {address.phone}
          </p>
          <p>{[address.address_line_1, address.district, address.province, address.postal_code].filter(Boolean).join(", ")}</p>
        </div>
      )}
    </EmailShell>
  );
}

/** An account email, such as a password reset link. */
export function AccountEmailViewer({ email, onClose, onFollow }: { email: EmailMessage; onClose: () => void; onFollow?: () => void }) {
  const navigate = useNavigate();
  const minutes = email.data?.expires_minutes ?? 30;

  const openLink = () => {
    onClose();
    onFollow?.();
    navigate({ to: "/reset-password", search: { token: email.data?.token ?? "" } });
  };

  if (email.kind === "BACK_IN_STOCK") {
    const item = email.data ?? {};
    const openProduct = () => {
      onClose();
      onFollow?.();
      navigate({ to: "/products/$slug", params: { slug: item.product_slug ?? "" }, search: item.variant_id ? { variant: item.variant_id } : {} });
    };
    return (
      <EmailShell email={email} onClose={onClose} label="Back in stock">
        <div className="space-y-3">
          <h3 className="text-2xl font-black tracking-tight text-zinc-950">It's back</h3>
          <p className="text-sm leading-relaxed text-zinc-600">
            Good news: the {item.product_name} you asked us to watch is available again. Stock is limited, and we can't hold it until you order.
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-4">
          <div className="w-20 h-20 shrink-0 rounded-xl bg-zinc-50 flex items-center justify-center overflow-hidden">
            {item.image && <img src={item.image} alt="" className="max-w-full max-h-full object-contain" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-zinc-950">{item.product_name}</p>
            <p className="text-xs text-zinc-500">{item.variant}</p>
            {item.price ? <p className="mt-1 text-sm font-bold text-zinc-950">{formatTHB(item.price)}</p> : null}
          </div>
        </div>
        <button type="button" onClick={openProduct} className={ctaClass}>
          Shop now
        </button>
      </EmailShell>
    );
  }

  return (
    <EmailShell email={email} onClose={onClose} label="Account security">
      <div className="space-y-3">
        <h3 className="text-2xl font-black tracking-tight text-zinc-950">Reset your password</h3>
        <p className="text-sm leading-relaxed text-zinc-600">
          We received a request to reset the password for {email.recipient}. Choose a new one with the button below. The link works once and expires in {minutes} minutes.
        </p>
      </div>
      <button type="button" onClick={openLink} className={ctaClass}>
        Reset password
      </button>
      <p className="text-xs leading-relaxed text-zinc-500">
        Didn't ask for this? You can ignore this email. Your password stays the same until you use the link.
      </p>
    </EmailShell>
  );
}

/** A compact row for an inbox-style list of emails. */
export function EmailRow({ email, onOpen }: { email: EmailMessage; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
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
