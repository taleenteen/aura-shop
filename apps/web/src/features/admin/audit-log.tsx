import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, History, Loader2, Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { AuditLog } from "@/types/api";

const PAGE_SIZE = 30;

const TYPES: { value: string; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "product", label: "Products" },
  { value: "variant", label: "Stock" },
  { value: "order", label: "Orders" },
  { value: "banner", label: "Banners" },
  { value: "category", label: "Categories" },
  { value: "brand", label: "Brands" },
  { value: "review", label: "Reviews" },
  { value: "import", label: "CSV imports" },
];

const ACTIONS: Record<string, string> = {
  "product.create": "created product",
  "product.update": "edited product",
  "product.hide": "took product off sale",
  "product.show": "put product on sale",
  "stock.adjust": "adjusted stock",
  "order.status": "updated order",
  "banner.create": "created banner",
  "banner.update": "edited banner",
  "banner.on": "switched banner on",
  "banner.off": "switched banner off",
  "banner.delete": "deleted banner",
  "category.create": "created category",
  "category.update": "edited category",
  "category.delete": "deleted category",
  "brand.create": "created brand",
  "brand.update": "edited brand",
  "brand.delete": "deleted brand",
  "review.hide": "hid review",
  "review.show": "showed review",
  "products.import": "imported products from",
};

const fieldLabel = (f: string) => f.replace(/_/g, " ").replace(/\./g, " › ");
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Admin › Activity: who changed what, and when. */
export function AuditLogPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [debounced, setDebounced] = useState({ q: "", actor: "" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ q: query.trim(), actor: actor.trim() });
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query, actor]);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (type) params.set("type", type);
    if (debounced.q) params.set("q", debounced.q);
    if (debounced.actor) params.set("actor", debounced.actor);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await apiClient<AuditLog[]>(`/admin/audit-logs?${params}`);
      if (id !== latest.current) return;
      setRows(res.data || []);
      setTotal(res.meta?.total_items ?? 0);
      setTotalPages(Math.max(1, res.meta?.total_pages ?? 1));
    } catch (err) {
      if (id === latest.current) setError((err as Error).message || "Could not load the activity log.");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, type, debounced, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Where the record can be opened, if anywhere. */
  const openRecord = (e: AuditLog) => {
    if (e.entity_type === "product") navigate({ to: "/admin", search: { tab: "products", edit: e.entity_id } });
    else if (e.entity_type === "order") navigate({ to: "/orders/$orderNumber", params: { orderNumber: e.entity_label } });
    else if (e.entity_type === "banner") navigate({ to: "/admin", search: { tab: "banners" } });
    else if (e.entity_type === "category" || e.entity_type === "brand") navigate({ to: "/admin", search: { tab: "catalog" } });
    else if (e.entity_type === "review") navigate({ to: "/admin", search: { tab: "reviews" } });
  };

  const input = "px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Activity</h2>
        <p className="text-xs text-zinc-500 mt-1">
          {total} change{total === 1 ? "" : "s"} recorded • every admin edit to products, stock, orders, banners, categories, brands and reviews, with before and after values.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Product name, order number…" aria-label="Search records" className={`${input} w-full pl-9`} />
        </div>
        <input type="search" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Admin email" aria-label="Filter by admin" className={`${input} lg:w-48`} />
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by record type" className={input}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          From
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={input} />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          To
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={input} />
        </label>
      </div>

      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}

      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-14 flex justify-center text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-xs text-zinc-500 space-y-2">
            <History className="w-6 h-6 mx-auto text-zinc-300" />
            <p>{type || debounced.q || debounced.actor || from || to ? "No changes match these filters." : "No admin changes recorded yet."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((e) => {
              const expanded = open.has(e.id);
              const canOpen = ["product", "order", "banner", "category", "brand", "review"].includes(e.entity_type);
              return (
                <li key={e.id} className="text-xs">
                  <div className="px-4 py-3 flex flex-wrap items-start gap-x-3 gap-y-1">
                    <button
                      type="button"
                      onClick={() => toggle(e.id)}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} changes`}
                      disabled={e.changes.length === 0}
                      className="mt-0.5 p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-30 disabled:cursor-default"
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-700 dark:text-zinc-300">
                        <span className="font-semibold text-zinc-900 dark:text-white">{e.actor_email || "System"}</span> {ACTIONS[e.action] ?? e.action}{" "}
                        {canOpen ? (
                          <button type="button" onClick={() => openRecord(e)} className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2 decoration-zinc-300 hover:decoration-zinc-900 cursor-pointer">
                            {e.entity_label || e.entity_id}
                          </button>
                        ) : (
                          <span className="font-semibold text-zinc-900 dark:text-white">{e.entity_label || e.entity_id}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {fmtTime(e.created_at)} • {e.changes.length} change{e.changes.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  {expanded && e.changes.length > 0 && (
                    <div className="px-4 pb-3 pl-11 overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                          <tr>
                            <th className="py-1 pr-3 font-semibold">Field</th>
                            <th className="py-1 pr-3 font-semibold">Before</th>
                            <th className="py-1 font-semibold">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 align-top">
                          {e.changes.map((c, i) => (
                            <Fragment key={i}>
                              <tr>
                                <td className="py-1.5 pr-3 font-mono text-zinc-500 whitespace-nowrap">{fieldLabel(c.field)}</td>
                                <td className="py-1.5 pr-3 text-zinc-400 line-through decoration-zinc-300 break-all">{c.from || "–"}</td>
                                <td className="py-1.5 text-zinc-900 dark:text-white font-semibold break-all">{c.to || "–"}</td>
                              </tr>
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer">
              Newer
            </button>
            <span className="text-zinc-500">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer">
              Older
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
