import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, Inbox, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import { useStockAlertStore } from "@/stores/stock-alert-store";
import type { EmailMessage } from "@/types/api";
import { AccountEmailViewer, EmailRow } from "@/features/orders/email-viewer";

/** Account › Inbox: account emails (back in stock, password reset) and pending stock alerts. */
export function InboxSection() {
  const { alerts, loaded, load, unsubscribe } = useStockAlertStore();
  const [emails, setEmails] = useState<EmailMessage[] | null>(null);
  const [open, setOpen] = useState<EmailMessage | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    load();
    apiClient<EmailMessage[]>("/account/emails")
      .then((res) => setEmails(res.data || []))
      .catch(() => setEmails([]));
  }, [load]);

  const cancel = async (variantId: string) => {
    setCancelling(variantId);
    try {
      await unsubscribe(variantId);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="alerts-heading" className="space-y-3">
        <h2 id="alerts-heading" className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
          <BellRing className="w-4 h-4 text-zinc-400" aria-hidden />
          Waiting for stock
        </h2>
        {!loaded ? (
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        ) : alerts.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nothing yet. On a sold-out option, tap "Email me when it's back" and we'll write as soon as it's in stock.
          </p>
        ) : (
          <ul className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
            {alerts.map((a) => (
              <li key={a.variant_id} className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {a.image && <img src={a.image} alt="" className="max-w-full max-h-full object-contain" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/products/$slug"
                    params={{ slug: a.product_slug }}
                    search={{ variant: a.variant_id }}
                    className="block text-sm font-semibold text-zinc-900 dark:text-white truncate hover:underline underline-offset-2"
                  >
                    {a.product_name}
                  </Link>
                  <p className="text-xs text-zinc-500 truncate">
                    {a.variant} • {formatTHB(a.price)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={cancelling === a.variant_id}
                  onClick={() => cancel(a.variant_id)}
                  className="shrink-0 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  Stop waiting
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inbox-heading" className="space-y-3">
        <h2 id="inbox-heading" className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
          <Inbox className="w-4 h-4 text-zinc-400" aria-hidden />
          Messages
        </h2>
        {emails === null ? (
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        ) : emails.length === 0 ? (
          <p className="text-xs text-zinc-500">No messages. Order emails are on each order's page in My Orders.</p>
        ) : (
          <ul className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {emails.map((e) => (
              <li key={e.id}>
                <EmailRow email={e} onOpen={() => setOpen(e)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <AccountEmailViewer email={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
