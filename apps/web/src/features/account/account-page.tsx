import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, Package, UserRound } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { Order, OrderStatus, User } from "@/types/api";
import { STATUS_META, STEPS, STEP_REACHED, formatTime, isPayable } from "@/features/orders/order-status";
import { CancelOrderButton } from "@/features/orders/cancel-order-button";
import { carrierName } from "@/features/orders/carriers";

type AccountTab = "orders" | "profile";

/** Customer-facing order stages. Each groups one or more backend statuses. */
type Stage = "all" | "to_pay" | "to_ship" | "shipping" | "delivered" | "cancelled";

const STAGES: { id: Stage; label: string; statuses: OrderStatus[] }[] = [
  { id: "all", label: "All", statuses: [] },
  { id: "to_pay", label: "To Pay", statuses: ["PENDING_PAYMENT"] },
  { id: "to_ship", label: "To Ship", statuses: ["PAID_PROCESSING", "SN_ASSIGNED"] },
  { id: "shipping", label: "Shipping", statuses: ["SHIPPED"] },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const setAuthOpen = useUIStore((state) => state.setAuthOpen);
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const tab: AccountTab = search.tab === "profile" ? "profile" : "orders";

  if (isRestoring) {
    return (
      <div className="py-32 flex justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
        <UserRound className="w-10 h-10 mx-auto text-zinc-300" />
        <h1 className="text-xl font-bold text-zinc-950 dark:text-white">Sign in to see your account</h1>
        <p className="text-sm text-zinc-500">Track your orders and keep your delivery address up to date.</p>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-semibold hover:opacity-90 cursor-pointer"
        >
          Sign In
        </button>
      </div>
    );
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
      active
        ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
        : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">My Account</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {user.full_name} • {user.email}
        </p>
      </div>

      <div role="tablist" aria-label="Account sections" className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "orders"}
          className={tabClass(tab === "orders")}
          onClick={() => navigate({ to: "/account", search: { tab: "orders" }, replace: true })}
        >
          My Orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "profile"}
          className={tabClass(tab === "profile")}
          onClick={() => navigate({ to: "/account", search: { tab: "profile" }, replace: true })}
        >
          Profile & Address
        </button>
      </div>

      {tab === "orders" ? (
        <OrdersSection />
      ) : (
        <div className="space-y-6">
          {search.reset === "1" && (
            <p role="status" className="px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Your password has been reset and you're signed in.
            </p>
          )}
          <ProfileSection user={user} />
          <ChangePasswordSection />
        </div>
      )}
    </div>
  );
}

function OrdersSection() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("all");

  useEffect(() => {
    let cancelled = false;
    apiClient<Order[]>("/account/orders")
      .then((res) => !cancelled && setOrders(res.data || []))
      .catch((err) => !cancelled && setError((err as Error).message || "Failed to load orders"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { all: orders.length, to_pay: 0, to_ship: 0, shipping: 0, delivered: 0, cancelled: 0 };
    for (const o of orders) {
      const s = STAGES.find((st) => st.id !== "all" && st.statuses.includes(o.status));
      if (s) c[s.id] += 1;
    }
    return c;
  }, [orders]);

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="py-12 text-center text-sm text-rose-600 dark:text-rose-400">
        Could not load your orders: {error}
      </p>
    );
  }

  const active = STAGES.find((s) => s.id === stage)!;
  const visible = stage === "all" ? orders : orders.filter((o) => active.statuses.includes(o.status));

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Order status" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={stage === s.id}
            onClick={() => setStage(s.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              stage === s.id
                ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950 dark:border-white"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
            }`}
          >
            <span>{s.label}</span>
            <span className={`text-[10px] ${stage === s.id ? "opacity-80" : "text-zinc-400"}`}>{counts[s.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="py-16 text-center space-y-3 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <Package className="w-9 h-9 mx-auto text-zinc-300" />
          <p className="font-semibold text-zinc-900 dark:text-white">
            {orders.length === 0 ? "No orders yet" : `No orders in “${active.label}”`}
          </p>
          <p className="text-sm text-zinc-500">
            {orders.length === 0 ? "Orders you place while signed in will appear here." : "Try another tab."}
          </p>
          {orders.length === 0 && (
            <Link
              to="/catalog"
              className="inline-block mt-1 px-4 py-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-semibold hover:opacity-90"
            >
              Start shopping
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onChange={(updated) => setOrders((list) => list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order, onChange }: { order: Order; onChange: (order: Order) => void }) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  const reached = STEP_REACHED[order.status];
  const items = order.items ?? [];
  const shown = items.slice(0, 2);
  const units = items.reduce((n, i) => n + i.quantity, 0);
  const payable = isPayable(order);

  return (
    <li className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60">
        <div className="text-xs text-zinc-500">
          <span className="font-mono font-bold text-zinc-900 dark:text-white">{order.order_number}</span>
          <span className="mx-2">•</span>
          <span>{formatDate(order.created_at)}</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.tone}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden />
          {meta.label}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {reached >= 0 && (
          <ol className="flex items-center gap-1.5" aria-label={`Progress: ${STEPS[reached]}`}>
            {STEPS.map((step, i) => (
              <li key={step} className="flex-1 min-w-0">
                <div className={`h-1.5 rounded-full ${i <= reached ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"}`} />
                <span className={`mt-1 block truncate text-[10px] ${i <= reached ? "text-zinc-700 dark:text-zinc-300 font-semibold" : "text-zinc-400"}`}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        )}

        <ul className="space-y-2">
          {shown.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-white truncate">{item.name_snapshot}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {item.spec_summary} • Qty {item.quantity}
                </p>
              </div>
              <span className="shrink-0 text-zinc-700 dark:text-zinc-300">{formatTHB(item.unit_price * item.quantity)}</span>
            </li>
          ))}
          {items.length > shown.length && (
            <li className="text-xs text-zinc-500">+{items.length - shown.length} more item(s)</li>
          )}
        </ul>

        {order.status === "PENDING_PAYMENT" && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {payable
              ? `Your items are held until ${formatTime(order.reservation_expires_at)}. Pay before then to confirm the order.`
              : "The payment window has closed; the items are going back to your bag."}
          </p>
        )}
        {order.status === "SHIPPED" && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              {order.tracking_number
                ? <>With {carrierName(order.carrier)} • <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{order.tracking_number}</span></>
                : "Your parcel is with the courier."}
            </span>
            {order.tracking_number && (
              <Link to="/orders/$orderNumber" params={{ orderNumber: order.order_number }} search={{ track: "1" }} className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2">
                Track parcel
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          {units} {units === 1 ? "item" : "items"} • Total{" "}
          <strong className="text-zinc-950 dark:text-white">{formatTHB(order.grand_total)}</strong>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {payable && <CancelOrderButton orderNumber={order.order_number} onCancelled={onChange} />}
          <Link
            to="/orders/$orderNumber"
            params={{ orderNumber: order.order_number }}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            View details
          </Link>
          {payable && (
            <Link
              to="/checkout"
              search={{ order: order.order_number }}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:opacity-90"
            >
              Complete payment
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function ProfileSection({ user }: { user: User }) {
  const setUser = useAuthStore((state) => state.setUser);
  const [fullName, setFullName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = fullName !== user.full_name || phone !== (user.phone ?? "") || address !== (user.address ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await apiClient<User>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName, phone, address }),
      });
      setUser({ ...user, ...res.data });
      setFullName(res.data.full_name);
      setPhone(res.data.phone ?? "");
      setAddress(res.data.address ?? "");
      setMessage({ kind: "ok", text: "Profile saved." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message || "Could not save your profile." });
    } finally {
      setIsSaving(false);
    }
  };

  const input =
    "w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white";
  const label = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="profile-name" className={label}>Full name</label>
          <input id="profile-name" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="profile-phone" className={label}>Mobile phone</label>
          <input id="profile-phone" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className={input} autoComplete="tel" />
        </div>
      </div>

      <div>
        <label htmlFor="profile-email" className={label}>Email</label>
        <input id="profile-email" value={user.email} readOnly disabled className={`${input} opacity-60 cursor-not-allowed`} />
        <p className="mt-1 text-[11px] text-zinc-400">Your sign-in email can’t be changed here.</p>
      </div>

      <div>
        <label htmlFor="profile-address" className={label}>Delivery address</label>
        <textarea
          id="profile-address"
          rows={6}
          maxLength={1000}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={"House no., building, street\nSub-district, district\nProvince, postal code"}
          className={`${input} resize-y leading-relaxed`}
          autoComplete="street-address"
        />
        <p className="mt-1 text-[11px] text-zinc-400">{address.length}/1000</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!dirty || isSaving}
          className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        {dirty && !isSaving && <span className="text-xs text-zinc-500">You have unsaved changes.</span>}
        {message && (
          <span role="status" className={`text-xs font-semibold ${message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (next.length < 6) return setErrors({ new_password: "Use at least 6 characters." });
    if (next !== confirm) return setErrors({ confirm: "Passwords don't match." });
    setErrors({});
    setBusy(true);
    try {
      await apiClient("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ kind: "ok", text: "Password updated." });
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setErrors(apiErr.fields ?? {});
      if (!apiErr.fields) setMessage({ kind: "error", text: apiErr.message || "Could not change your password." });
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white";
  const label = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";
  const fieldError = (key: string) => errors[key] && <p className="mt-1 text-[11px] text-rose-600">{errors[key]}</p>;

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 space-y-5 shadow-xs">
      <div>
        <h2 className="text-lg font-bold text-zinc-950 dark:text-white">Password</h2>
        <p className="text-xs text-zinc-500 mt-1">Use at least 6 characters. You'll stay signed in on this device.</p>
      </div>
      <div>
        <label htmlFor="pw-current" className={label}>Current password</label>
        <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        {fieldError("current_password")}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="pw-new" className={label}>New password</label>
          <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
          {fieldError("new_password")}
        </div>
        <div>
          <label htmlFor="pw-confirm" className={label}>Confirm new password</label>
          <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
          {fieldError("confirm")}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !current || !next}
          className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
        {message && (
          <span role="status" className={`text-xs font-semibold ${message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
