import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { apiClient, apiDownload, saveFile } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import type { SalesReport } from "@/types/api";

type Group = SalesReport["group"];
type Preset = "7d" | "30d" | "90d" | "month" | "last_month" | "year" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

const PAYMENT_LABEL: Record<string, string> = { PROMPTPAY_QR: "PromptPay", CREDIT_CARD: "Credit card", INSTALLMENT_0: "0% installment" };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;

function presetRange(p: Preset): [string, string] {
  const today = new Date();
  const back = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  switch (p) {
    case "7d":
      return [iso(back(6)), iso(today)];
    case "90d":
      return [iso(back(89)), iso(today)];
    case "month":
      return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today)];
    case "last_month":
      return [iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), iso(new Date(today.getFullYear(), today.getMonth(), 0))];
    case "year":
      return [iso(new Date(today.getFullYear(), 0, 1)), iso(today)];
    default:
      return [iso(back(29)), iso(today)];
  }
}

/** Day for short ranges, week up to ~6 months, month beyond. */
const autoGroup = (from: string, to: string): Group => {
  const n = daysBetween(from, to);
  return n <= 31 ? "day" : n <= 183 ? "week" : "month";
};

function periodLabel(start: string, group: Group): string {
  const d = new Date(start);
  if (group === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  if (group === "week") return `Week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const baht = (satang: number) => (satang / 100).toFixed(2);

/** Admin › Sales report. */
export function SalesReportPanel() {
  const initial = presetRange("30d");
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(initial[0]);
  const [to, setTo] = useState(initial[1]);
  const [group, setGroup] = useState<Group>(autoGroup(initial[0], initial[1]));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const [f, t] = presetRange(p);
    setFrom(f);
    setTo(t);
    setGroup(autoGroup(f, t));
  };

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<SalesReport>(`/admin/reports/sales?from=${from}&to=${to}&group=${group}`);
      setReport(res.data);
    } catch (err) {
      setError((err as Error).message || "Could not load the report.");
    } finally {
      setLoading(false);
    }
  }, [from, to, group]);

  useEffect(() => {
    load();
  }, [load]);

  const exportLines = async () => {
    setExporting(true);
    try {
      await apiDownload(`/admin/reports/sales/export?from=${from}&to=${to}`, `aura-sales-${from}-to-${to}.csv`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportSummary = () => {
    if (!report) return;
    const rows: (string | number)[][] = [
      [`AURA Tech sales ${report.from} to ${report.to}`],
      [],
      ["Revenue (THB)", baht(report.totals.revenue_satang)],
      ["Paid orders", report.totals.orders],
      ["Units sold", report.totals.units],
      ["Average order (THB)", baht(report.totals.avg_order_satang)],
      ["Orders from new customers", report.totals.new_customer_orders],
      ["Refunded orders", report.totals.refunded_orders],
      ["Refunded (THB)", baht(report.totals.refunded_satang)],
      [],
      [report.group === "day" ? "Day" : report.group === "week" ? "Week starting" : "Month starting", "Orders", "Units", "Revenue (THB)"],
      ...report.series.map((s) => [s.start, s.orders, s.units, baht(s.revenue_satang)]),
      [],
      ["Top products", "Units", "Orders", "Revenue (THB)"],
      ...report.top_products.map((p) => [p.label, p.units, p.orders, baht(p.revenue_satang)]),
      [],
      ["Category", "Units", "Orders", "Revenue (THB)"],
      ...report.categories.map((c) => [c.label, c.units, c.orders, baht(c.revenue_satang)]),
      [],
      ["Payment method", "Orders", "Revenue (THB)"],
      ...report.payment_methods.map((p) => [PAYMENT_LABEL[p.key] ?? p.key, p.orders, baht(p.revenue_satang)]),
    ];
    const text = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    saveFile(new Blob([text], { type: "text/csv;charset=utf-8" }), `aura-sales-summary-${report.from}-to-${report.to}.csv`);
  };

  const input = "px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900";
  const btn = "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Sales report</h2>
          <p className="text-xs text-zinc-500 mt-1">Paid orders by order date (Thailand time). Cancelled-after-payment orders count as refunds.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportSummary} disabled={!report} className={`${btn} border border-zinc-200 dark:border-zinc-700`}>
            <Download className="w-4 h-4" />
            Summary (CSV)
          </button>
          <button type="button" onClick={exportLines} disabled={exporting} className={`${btn} bg-zinc-950 text-white dark:bg-white dark:text-zinc-950`}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Order lines (CSV)
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center gap-3">
        <div role="tablist" aria-label="Date range" className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={preset === p.id}
              onClick={() => choosePreset(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                preset === p.id ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From" value={from} max={to} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className={input} />
          <span className="text-xs text-zinc-400">to</span>
          <input type="date" aria-label="To" value={to} min={from} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className={input} />
          <select aria-label="Group by" value={group} onChange={(e) => setGroup(e.target.value as Group)} className={input}>
            <option value="day">By day</option>
            <option value="week">By week</option>
            <option value="month">By month</option>
          </select>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}

      {!report ? (
        <div className="py-20 flex justify-center text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <Kpis report={report} />
          <RevenueChart report={report} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Breakdown title="Top products" rows={report.top_products} total={report.totals.revenue_satang} showUnits />
            <div className="space-y-6">
              <Breakdown title="By category" rows={report.categories} total={report.categories.reduce((n, c) => n + c.revenue_satang, 0)} showUnits />
              <Breakdown
                title="By payment method"
                rows={report.payment_methods.map((p) => ({ ...p, label: PAYMENT_LABEL[p.key] ?? p.key }))}
                total={report.totals.revenue_satang}
              />
            </div>
          </div>
          <PeriodTable report={report} />
        </div>
      )}
    </div>
  );
}

function Kpis({ report }: { report: SalesReport }) {
  const { totals: t, previous: p } = report;
  const change = (now: number, before: number) => (before === 0 ? null : ((now - before) / before) * 100);
  const tiles: { label: string; value: string; delta?: number | null; note?: string }[] = [
    { label: "Revenue", value: formatTHB(t.revenue_satang), delta: change(t.revenue_satang, p.revenue_satang) },
    { label: "Paid orders", value: t.orders.toLocaleString("en-GB"), delta: change(t.orders, p.orders) },
    { label: "Average order", value: formatTHB(t.avg_order_satang), delta: change(t.avg_order_satang, p.avg_order_satang) },
    { label: "Units sold", value: t.units.toLocaleString("en-GB"), delta: change(t.units, p.units) },
    { label: "New customers", value: t.new_customer_orders.toLocaleString("en-GB"), note: "orders from first-time buyers" },
    { label: "Refunds", value: formatTHB(t.refunded_satang), note: `${t.refunded_orders} order${t.refunded_orders === 1 ? "" : "s"} cancelled after payment` },
  ];
  return (
    <ul className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {tiles.map((k) => (
        <li key={k.label} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{k.label}</p>
          <p className="mt-1 text-lg font-black text-zinc-950 dark:text-white tabular-nums">{k.value}</p>
          {k.delta !== undefined && (
            <p className="mt-0.5 text-[11px] text-zinc-500 flex items-center gap-1">
              {k.delta === null ? (
                "no sales in the previous period"
              ) : (
                <>
                  {k.delta >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" aria-hidden /> : <TrendingDown className="w-3.5 h-3.5 text-rose-600" aria-hidden />}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{k.delta >= 0 ? "+" : ""}{k.delta.toFixed(1)}%</span> vs previous period
                </>
              )}
            </p>
          )}
          {k.note && <p className="mt-0.5 text-[11px] text-zinc-500">{k.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Revenue per period: one series, bars from a zero baseline, hover for exact values. */
function RevenueChart({ report }: { report: SalesReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...report.series.map((s) => s.revenue_satang));
  // A clean top value for the scale (1, 2 or 5 × 10^n baht).
  const top = useMemo(() => {
    const raw = max / 100;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const step = [1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10;
    return step * mag * 100;
  }, [max]);
  const ticks = [1, 0.5, 0];
  const many = report.series.length > 16;
  const h = hover !== null ? report.series[hover] : null;

  return (
    <section aria-labelledby="revenue-chart" className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 id="revenue-chart" className="text-sm font-bold text-zinc-950 dark:text-white">Revenue {report.group === "day" ? "per day" : report.group === "week" ? "per week" : "per month"}</h3>
        <p className="text-[11px] text-zinc-500 h-4" aria-live="polite">
          {h ? `${periodLabel(h.start, report.group)}: ${formatTHB(h.revenue_satang)} • ${h.orders} order${h.orders === 1 ? "" : "s"} • ${h.units} unit${h.units === 1 ? "" : "s"}` : "Hover a bar for details"}
        </p>
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between h-48 text-[10px] text-zinc-400 tabular-nums text-right w-14 shrink-0 -mt-1.5 -mb-1.5">
          {ticks.map((t) => (
            <span key={t}>{formatTHB(Math.round(top * t)).replace(".00", "")}</span>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden>
            {ticks.map((t) => (
              <div key={t} className={`border-t ${t === 0 ? "border-zinc-300 dark:border-zinc-600" : "border-dashed border-zinc-100 dark:border-zinc-800"}`} />
            ))}
          </div>
          <ul className="relative h-48 flex items-end gap-[2px]" aria-label="Revenue per period" onMouseLeave={() => setHover(null)}>
            {report.series.map((s, i) => (
              <li
                key={s.start}
                className="flex-1 h-full flex items-end cursor-default"
                onMouseEnter={() => setHover(i)}
                aria-label={`${periodLabel(s.start, report.group)}: ${formatTHB(s.revenue_satang)}, ${s.orders} orders`}
              >
                <div
                  className={`w-full max-w-10 mx-auto rounded-t-[4px] transition-colors ${hover === i ? "bg-emerald-600" : "bg-emerald-500"}`}
                  style={{ height: s.revenue_satang > 0 ? `max(2px, ${(s.revenue_satang / top) * 100}%)` : 0 }}
                />
              </li>
            ))}
          </ul>
          <div className="flex gap-[2px] mt-1.5" aria-hidden>
            {report.series.map((s, i) => (
              <span key={s.start} className="flex-1 text-center text-[10px] text-zinc-400 truncate">
                {!many || i % Math.ceil(report.series.length / 8) === 0
                  ? new Date(s.start).toLocaleDateString("en-GB", report.group === "month" ? { month: "short" } : { day: "numeric", month: "short" })
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Breakdown({ title, rows, total, showUnits }: { title: string; rows: { key: string; label: string; orders: number; units: number; revenue_satang: number }[]; total: number; showUnits?: boolean }) {
  return (
    <section aria-label={title} className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h3 className="text-sm font-bold text-zinc-950 dark:text-white mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">No sales in this range.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const share = total > 0 ? (r.revenue_satang / total) * 100 : 0;
            return (
              <li key={r.key} className="text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold text-zinc-900 dark:text-white">{r.label}</span>
                  <span className="shrink-0 tabular-nums text-zinc-900 dark:text-white font-semibold">{formatTHB(r.revenue_satang)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                  </span>
                  <span className="shrink-0 w-28 text-right tabular-nums text-zinc-500">
                    {share.toFixed(0)}% • {showUnits ? `${r.units} unit${r.units === 1 ? "" : "s"}` : `${r.orders} order${r.orders === 1 ? "" : "s"}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PeriodTable({ report }: { report: SalesReport }) {
  const rows = [...report.series].reverse();
  return (
    <details className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <summary className="px-5 py-4 text-sm font-bold text-zinc-950 dark:text-white cursor-pointer select-none">Table view ({rows.length} {report.group}s)</summary>
      <div className="px-5 pb-5 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-2 pr-3">{report.group === "day" ? "Day" : report.group === "week" ? "Week" : "Month"}</th>
              <th className="py-2 pr-3 text-right">Orders</th>
              <th className="py-2 pr-3 text-right">Units</th>
              <th className="py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums">
            {rows.map((s) => (
              <tr key={s.start} className={s.orders === 0 ? "text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}>
                <td className="py-1.5 pr-3">{periodLabel(s.start, report.group)}</td>
                <td className="py-1.5 pr-3 text-right">{s.orders}</td>
                <td className="py-1.5 pr-3 text-right">{s.units}</td>
                <td className="py-1.5 text-right font-semibold">{formatTHB(s.revenue_satang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
