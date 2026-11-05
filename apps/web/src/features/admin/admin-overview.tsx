import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  DollarSign,
  ShoppingBag,
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  PieChart,
  Activity,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { AdminOverviewStats } from "@/types/api";
import { formatTHB } from "@/lib/currency";

const dayLabel = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

const longDayLabel = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

function RevenueTrend({ last30, prev30 }: { last30: number; prev30: number }) {
  if (prev30 === 0) {
    return (
      <span className="text-[11px] text-zinc-500">
        {last30 > 0 ? "No paid orders in the previous 30 days to compare" : "No paid orders in the last 60 days"}
      </span>
    );
  }
  const change = ((last30 - prev30) / prev30) * 100;
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
      <Icon className={`w-3.5 h-3.5 ${change >= 0 ? "text-emerald-500" : "text-rose-500"}`} aria-hidden />
      <span>
        {change >= 0 ? "+" : ""}
        {change.toFixed(1)}% last 30 days vs previous 30
      </span>
    </span>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    apiClient<AdminOverviewStats>("/admin/overview")
      .then((res) => setStats(res.data))
      .catch((err) => setError((err as Error).message || "Failed to load analytics"))
      .finally(() => setIsLoading(false));
  }, [token]);

  if (isLoading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs">Loading analytics...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <p role="alert" className="py-16 text-center text-sm text-rose-600 dark:text-rose-400">
        Could not load analytics: {error ?? "no data"}
      </p>
    );
  }

  // Default every list and count so an older or partial API response renders empty states
  // instead of crashing the whole backoffice.
  const paidOrders = stats.paid_orders_count ?? 0;
  const averageOrderValue = paidOrders > 0 ? Math.round(stats.total_revenue_satang / paidOrders) : 0;
  const lowStock = stats.low_stock_alerts ?? [];
  const ordersByStatus = stats.orders_by_status ?? {};

  const days = stats.daily_revenue ?? [];
  const maxDay = Math.max(0, ...days.map((d) => d.revenue_satang));
  const weekRevenue = days.reduce((sum, d) => sum + d.revenue_satang, 0);
  const peakDay = maxDay > 0 ? days.find((d) => d.revenue_satang === maxDay) : undefined;

  const categories = stats.category_revenue ?? [];
  const categoryTotal = categories.reduce((sum, c) => sum + c.revenue_satang, 0);
  const share = (satang: number) => (categoryTotal > 0 ? (satang / categoryTotal) * 100 : 0);

  return (
    <div className="space-y-8">
      {/* Top 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">Paid Revenue (All Time)</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-950 dark:text-white">
            {formatTHB(stats.total_revenue_satang)}
          </div>
          <div className="space-y-0.5">
            <RevenueTrend last30={stats.revenue_30d_satang ?? 0} prev30={stats.revenue_prev_30d_satang ?? 0} />
            <p className="text-[11px] text-zinc-400">Last 30 days: {formatTHB(stats.revenue_30d_satang ?? 0)}</p>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Orders</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-950 dark:text-white">
            {stats.total_orders_count}
          </div>
          <p className="text-[11px] text-zinc-500">
            {paidOrders} paid • average paid order {formatTHB(averageOrderValue)}
          </p>
          <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
            {Object.entries(ordersByStatus).map(([st, cnt]) => (
              <span key={st} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-medium">
                {st}: {cnt}
              </span>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">Low Stock Warnings</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-950 dark:text-white">
            {lowStock.length}
          </div>
          <p className="text-[11px] text-zinc-400">Configurations with &le; 3 units available</p>
        </div>
      </div>

      {/* Daily revenue (last 7 days) & category share */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Paid Revenue — Last 7 Days
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">By order date, Bangkok time. Hover a bar for details.</p>
          </div>

          {maxDay === 0 ? (
            <p className="py-16 text-center text-xs text-zinc-500">No paid orders in the last 7 days.</p>
          ) : (
            <ul className="pt-6 pb-2 flex items-end justify-between gap-3 px-2" aria-label="Paid revenue per day">
              {days.map((d) => {
                const heightPct = d.revenue_satang > 0 ? Math.max(4, (d.revenue_satang / maxDay) * 100) : 0;
                const summary = `${longDayLabel(d.date)}: ${formatTHB(d.revenue_satang)} from ${d.orders} paid ${d.orders === 1 ? "order" : "orders"}`;
                return (
                  <li key={d.date} className="flex-1 flex flex-col items-center gap-2 group" aria-label={summary} title={summary}>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono font-bold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded shadow-xs pointer-events-none whitespace-nowrap">
                      {formatTHB(d.revenue_satang)} • {d.orders}
                    </div>
                    <div className="w-full max-w-[40px] h-32 flex flex-col justify-end border-b border-zinc-200 dark:border-zinc-700">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full rounded-t bg-emerald-500 group-hover:bg-emerald-400 transition-colors"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{dayLabel(d.date)}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              7-day total: <strong className="text-zinc-800 dark:text-zinc-200">{formatTHB(weekRevenue)}</strong>
            </span>
            {peakDay && (
              <span>
                Best day: <strong className="text-zinc-800 dark:text-zinc-200">{longDayLabel(peakDay.date)}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col">
          <div className="pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Revenue by Category
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Share of paid line items, all time</p>
          </div>

          {categories.length === 0 ? (
            <p className="py-16 text-center text-xs text-zinc-500">No paid orders yet.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {categories.map((c) => (
                <li key={c.category} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate">{c.category}</span>
                    <span className="shrink-0">
                      <strong className="text-zinc-900 dark:text-white">{share(c.revenue_satang).toFixed(0)}%</strong>
                      <span className="ml-2 text-[11px] text-zinc-400 font-mono">{formatTHB(c.revenue_satang)}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${share(c.revenue_satang)}%` }} />
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    {c.units} {c.units === 1 ? "unit" : "units"} sold
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Low Stock Alert Table */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-zinc-950 dark:text-white uppercase tracking-wider">
              Inventory Critical Alerts (&le; 3 Available Units)
            </h3>
          </div>
          <span className="text-xs text-zinc-400">
            Soft-lock reserve monitor
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-3">Product Name</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3">Color</th>
                <th className="px-6 py-3">Physical Stock</th>
                <th className="px-6 py-3">15m Reserved</th>
                <th className="px-6 py-3">Available To Sell</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {lowStock.length > 0 ? (
                lowStock.map((item) => (
                  <tr
                    key={item.variant_id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-zinc-900 dark:text-white">
                      {item.product_name}
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-500">
                      {item.sku}
                    </td>
                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                      {item.color_name}
                    </td>
                    <td className="px-6 py-4 font-bold text-zinc-800 dark:text-zinc-200">
                      {item.stock_quantity}
                    </td>
                    <td className="px-6 py-4 text-amber-600 font-bold">
                      {item.reserved_stock}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        {item.available_stock} units left
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to="/admin"
                        search={{ tab: "products", edit: item.product_id }}
                        className="inline-flex items-center gap-1 text-zinc-900 dark:text-white hover:underline font-semibold"
                      >
                        <span>Restock</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-zinc-500"
                  >
                    All SKU configurations currently have healthy inventory levels (&gt; 3 units).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
