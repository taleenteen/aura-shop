import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DollarSign, ShoppingBag, AlertTriangle, ArrowUpRight, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { AdminOverviewStats } from "@/types/api";
import { formatTHB } from "@/lib/currency";

export function AdminOverview() {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    setIsLoading(true);
    apiClient<AdminOverviewStats>("/admin/overview")
      .then((res) => {
        setStats(res.data);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  if (isLoading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Total Revenue
            </span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-950 dark:text-white">
            {formatTHB(stats?.total_revenue_satang || 0)}
          </div>
          <p className="text-[11px] text-zinc-400">Paid and completed orders</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Total Orders
            </span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-950 dark:text-white">
            {stats?.total_orders_count || 0}
          </div>
          <div className="flex gap-2 text-[10px] text-zinc-500">
            {Object.entries(stats?.orders_by_status || {}).map(([st, cnt]) => (
              <span key={st} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                {st}: {cnt}
              </span>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Low Stock Warnings
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
            {stats?.low_stock_alerts?.length || 0}
          </div>
          <p className="text-[11px] text-zinc-400">Configurations with &le; 3 units</p>
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
              {stats?.low_stock_alerts && stats.low_stock_alerts.length > 0 ? (
                stats.low_stock_alerts.map((item) => (
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
                        to="/catalog"
                        className="inline-flex items-center gap-1 text-zinc-900 dark:text-white hover:underline font-semibold"
                      >
                        <span>View</span>
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
