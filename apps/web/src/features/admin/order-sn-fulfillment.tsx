import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Package,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Clock,
  Check,
  Truck,
  XCircle,
  ChevronRight,
  Barcode,
} from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import type { Carrier, Order, OrderStatus } from "@/types/api";
import { CARRIERS, carrierName } from "@/features/orders/carriers";

const PAGE_SIZE = 25;

type FilterStatus = "ALL" | "PENDING_PAYMENT" | "PAID_PROCESSING" | "SHIPPED" | "CANCELLED";

const TRANSITION_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID_PROCESSING: "PAID_PROCESSING (keep, save S/N only)",
  SN_ASSIGNED: "SN_ASSIGNED",
  SHIPPED: "SHIPPED (Enforces Non-Empty S/N)",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED (returns stock to inventory)",
};

// Forward step pre-selected for each status. Cancelling is never pre-selected.
const DEFAULT_NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID_PROCESSING: "SHIPPED",
  SN_ASSIGNED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

function defaultTargetFor(order: Order): OrderStatus | "" {
  const next = DEFAULT_NEXT_STATUS[order.status];
  return next && order.allowed_transitions?.includes(next) ? next : "";
}

export function OrderSNFulfillment() {
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const latestRequest = useRef(0);

  // Debounce typing; a new query starts from page 1 in the same update so only one fetch runs.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const t = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Fulfillment form state
  const [targetStatus, setTargetStatus] = useState<OrderStatus | "">("");
  const [serialNumbers, setSerialNumbers] = useState<Record<string, string[]>>({});
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipErrors, setShipErrors] = useState<Record<string, string>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrders = useCallback(async (): Promise<Order[]> => {
    const requestId = ++latestRequest.current;
    setIsLoadingOrders(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter !== "ALL") params.set("status", filter);
      if (search) params.set("q", search);
      const res = await apiClient<Order[]>(`/admin/orders?${params}`);
      if (requestId !== latestRequest.current) return [];
      const list = res.data || [];
      setOrders(list);
      setTotalOrders(res.meta?.total_items ?? list.length);
      setTotalPages(Math.max(res.meta?.total_pages ?? 1, 1));
      return list;
    } catch (err) {
      if (requestId !== latestRequest.current) return [];
      setOrders([]);
      setLoadError((err as Error).message || "Failed to load orders");
      return [];
    } finally {
      if (requestId === latestRequest.current) setIsLoadingOrders(false);
    }
  }, [filter, search, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setSuccessMsg(null);
    setErrorMsg(null);

    setTargetStatus(defaultTargetFor(order));
    setCarrier("");
    setTrackingNumber("");
    setShipErrors({});

    // One input per unit, pre-filled with any serials already recorded.
    const initialSNs: Record<string, string[]> = {};
    order.items?.forEach((item) => {
      initialSNs[item.id] = Array.from({ length: item.quantity }, (_, u) => item.serial_numbers?.[u] ?? "");
    });
    setSerialNumbers(initialSNs);
  };

  const handleSerialChange = (itemId: string, unit: number, value: string) => {
    setSerialNumbers((prev) => {
      const units = [...(prev[itemId] ?? [])];
      units[unit] = value.toUpperCase();
      return { ...prev, [itemId]: units };
    });
  };

  const serialsEditable =
    selectedOrder?.status === "PAID_PROCESSING" || selectedOrder?.status === "SN_ASSIGNED";

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !targetStatus) return;

    setIsUpdating(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setShipErrors({});

    try {
      await apiClient<{ message: string; status: string }>(
        `/admin/orders/${selectedOrder.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: targetStatus,
            // Serials are only accepted before shipping; blanks keep what is already saved.
            ...(serialsEditable ? { serial_numbers: serialNumbers } : {}),
            ...(targetStatus === "SHIPPED" ? { carrier, tracking_number: trackingNumber } : {}),
          }),
        }
      );

      setSuccessMsg(
        `Order ${selectedOrder.order_number} is now ${targetStatus}.`
      );

      // Refresh the table, then re-select the order so its allowed transitions are current.
      const refreshed = await fetchOrders();
      const updated = refreshed.find((o) => o.id === selectedOrder.id) ?? {
        ...selectedOrder,
        status: targetStatus,
        allowed_transitions: [],
      };
      setSelectedOrder(updated);
      setTargetStatus(defaultTargetFor(updated));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "SERIAL_NUMBER_REQUIRED") {
        setErrorMsg(
          "ENFORCEMENT BLOCK: Serial Number (S/N) is mandatory for every item before moving to SHIPPED."
        );
      } else {
        setShipErrors((err as ApiRequestError).fields ?? {});
        setErrorMsg((err as Error).message || "Failed to update order status");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "PENDING_PAYMENT":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Pending Payment
          </span>
        );
      case "PAID_PROCESSING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Check className="w-3 h-3" />
            Paid & Queued
          </span>
        );
      case "SHIPPED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Truck className="w-3 h-3" />
            Shipped
          </span>
        );
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Delivered
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {status}
          </span>
        );
    }
  };

  const filterTabs: Array<{ id: FilterStatus; label: string }> = [
    { id: "ALL", label: "All Orders" },
    { id: "PAID_PROCESSING", label: "Paid & Ready to Pack" },
    { id: "PENDING_PAYMENT", label: "Pending Payment" },
    { id: "SHIPPED", label: "Shipped" },
    { id: "CANCELLED", label: "Cancelled" },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-500" />
            <span>Order Fulfillment & S/N State Machine</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Click any order in the table below to inspect items, assign warranty serial numbers, and update fulfillment status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchOrders()}
          disabled={isLoadingOrders}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search */}
      <input
        type="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search order number or customer email"
        aria-label="Search orders"
        className="w-full sm:max-w-sm px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
      />

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-zinc-100 dark:border-zinc-800">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setFilter(tab.id);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filter === tab.id
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Layout: Orders Table on Left/Top, Fulfillment Panel on Right/Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Orders Table */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              Orders Queue ({totalOrders})
            </span>
            <span className="text-[11px] text-zinc-400">
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                {isLoadingOrders ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading orders queue...</span>
                      </div>
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-rose-600 dark:text-rose-400" role="alert">
                      Could not load orders: {loadError}
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                      {search ? `No orders match "${search}" under "${filter}".` : `No orders found under "${filter}".`}
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    const itemsCount =
                      order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

                    return (
                      <tr
                        key={order.id}
                        onClick={() => handleSelectOrder(order)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-amber-500/10 dark:bg-amber-500/15 font-medium"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-zinc-950 dark:text-white text-xs">
                            {order.order_number}
                          </span>
                          <span className="block text-[10px] text-zinc-400">
                            {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 max-w-[130px] truncate">
                          {order.customer_email}
                        </td>
                        <td className="px-4 py-3 text-zinc-500">
                          {itemsCount} {itemsCount === 1 ? "unit" : "units"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">
                          {formatTHB(order.grand_total)}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectOrder(order);
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-amber-500 text-zinc-950"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            }`}
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || isLoadingOrders}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span className="text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || isLoadingOrders}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Selected Order Fulfillment & State Machine Panel */}
        <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-xs space-y-5">
          {selectedOrder ? (
            <form onSubmit={handleStatusSubmit} className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                    Active Inspection
                  </span>
                  <h3 className="font-mono text-base font-black text-zinc-950 dark:text-white">
                    {selectedOrder.order_number}
                  </h3>
                </div>
                {getStatusBadge(selectedOrder.status)}
              </div>

              {/* Success / Error Messages */}
              {successMsg && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Order Info Cards */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Customer
                  </span>
                  <p className="font-medium text-zinc-900 dark:text-white truncate mt-0.5">
                    {selectedOrder.customer_email}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Total Amount
                  </span>
                  <p className="font-bold text-zinc-900 dark:text-white mt-0.5">
                    {formatTHB(selectedOrder.grand_total)}
                  </p>
                </div>
              </div>

              {/* Hardware Items & S/N Entry */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-900 dark:text-white">
                  Order Line Items & Warranty Serial Numbers (S/N)
                </label>

                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  <div className="space-y-3">
                    {selectedOrder.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white">
                              {idx + 1}. {item.name_snapshot}
                            </p>
                            <p className="text-[10px] font-mono text-zinc-500">
                              SKU: {item.sku_snapshot}
                            </p>
                            {item.spec_summary && (
                              <p className="text-[10px] text-zinc-400 mt-0.5">
                                {item.spec_summary}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                            x{item.quantity}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                              <Barcode className="w-3 h-3" />
                              Scan / Enter Serial Number{item.quantity > 1 ? "s (one per unit)" : ""}:
                            </span>
                            <span className="font-mono text-zinc-400">
                              (Required for SHIPPED)
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {Array.from({ length: item.quantity }, (_, unit) => (
                              <div key={unit} className="relative">
                                <input
                                  type="text"
                                  value={serialNumbers[item.id]?.[unit] ?? ""}
                                  onChange={(e) => handleSerialChange(item.id, unit, e.target.value)}
                                  disabled={!serialsEditable}
                                  aria-label={`Serial number for ${item.sku_snapshot} unit ${unit + 1}`}
                                  placeholder={item.quantity > 1 ? `Unit ${unit + 1}, e.g. C02M4PRO8891` : "e.g. C02M4PRO8891"}
                                  className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                                />
                                <ShieldCheck className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">No items registered for this order.</p>
                )}
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-zinc-900 dark:text-white mb-1.5">
                  Fulfillment Status State Transition
                </label>
                {selectedOrder.allowed_transitions?.length ? (
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value as OrderStatus | "")}
                    className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="" disabled>
                      Select new status…
                    </option>
                    {selectedOrder.allowed_transitions.map((status) => (
                      <option key={status} value={status}>
                        {TRANSITION_LABELS[status]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-zinc-500">
                    This order is {selectedOrder.status} and has no further fulfillment steps.
                  </p>
                )}
                {selectedOrder.status === "PENDING_PAYMENT" && (
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    Awaiting customer payment. Payment is confirmed only through checkout, so the only
                    admin action is cancelling, which releases the reserved stock.
                  </p>
                )}
              </div>

              {/* Shipment: required when handing the order to a carrier */}
              {targetStatus === "SHIPPED" && selectedOrder.status !== "SHIPPED" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ship-carrier" className="block text-xs font-bold text-zinc-900 dark:text-white mb-1.5">
                      Carrier
                    </label>
                    <select
                      id="ship-carrier"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value as Carrier | "")}
                      className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {(Object.keys(CARRIERS) as Carrier[]).map((c) => (
                        <option key={c} value={c}>
                          {CARRIERS[c].name}
                        </option>
                      ))}
                    </select>
                    {shipErrors.carrier && <p className="mt-1 text-[11px] text-rose-600">{shipErrors.carrier}</p>}
                  </div>
                  <div>
                    <label htmlFor="ship-tracking" className="block text-xs font-bold text-zinc-900 dark:text-white mb-1.5">
                      Tracking number
                    </label>
                    <input
                      id="ship-tracking"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
                      placeholder={carrier ? CARRIERS[carrier].example : "From the carrier's label"}
                      className="w-full px-3 py-2.5 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    />
                    {shipErrors.tracking_number && <p className="mt-1 text-[11px] text-rose-600">{shipErrors.tracking_number}</p>}
                  </div>
                </div>
              )}
              {selectedOrder.tracking_number && (
                <p className="text-xs text-zinc-500">
                  Shipped with {carrierName(selectedOrder.carrier)} •{" "}
                  <span className="font-mono font-semibold text-zinc-900 dark:text-white">{selectedOrder.tracking_number}</span>
                </p>
              )}

              {/* S/N Enforcement Notice */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                ⚠️ <strong>Warehouse Rule:</strong> Marking an order as{" "}
                <span className="font-bold">SHIPPED</span> needs a serial number for every unit, plus the carrier and tracking number. The customer is emailed the tracking details.
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isUpdating || !targetStatus}
                className="w-full py-3 px-4 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 shadow-md transition-opacity cursor-pointer flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing State Transition...</span>
                  </>
                ) : (
                  <span>Save Serial Numbers & Update Status</span>
                )}
              </button>
            </form>
          ) : (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-zinc-900 dark:text-white">
                No Order Selected
              </h4>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                Select an order from the queue on the left to inspect customer details, assign hardware serial numbers, and update fulfillment states.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
