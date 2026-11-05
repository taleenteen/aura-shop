import { isFlagSet } from "@/lib/search-params";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, FileSpreadsheet, ImageOff, Loader2, Pencil, Plus, Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import type { AdminProductSummary, Category } from "@/types/api";
import { ProductEditor } from "./product-editor";
import { ProductImport } from "./product-import";

type StatusFilter = "" | "active" | "inactive";
const PAGE_SIZE = 20;

/** Admin › Products: the list, the editor (?edit=<id|new>) or the CSV import (?import=1). */
export function ProductsAdmin() {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const edit = typeof search.edit === "string" ? search.edit : null;
  if (isFlagSet(search.import)) return <ProductImport />;
  return edit ? <ProductEditor productId={edit === "new" ? null : edit} /> : <ProductList />;
}

function ProductList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    apiClient<Category[]>("/categories").then((r) => setCategories(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const next = query.trim();
    if (next === debounced) return;
    const t = setTimeout(() => {
      setDebounced(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query, debounced]);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (debounced) params.set("q", debounced);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    try {
      const res = await apiClient<AdminProductSummary[]>(`/admin/products?${params}`);
      if (id !== latest.current) return;
      setRows(res.data || []);
      setTotal(res.meta?.total_items ?? 0);
      setTotalPages(Math.max(1, res.meta?.total_pages ?? 1));
    } catch (err) {
      if (id === latest.current) setError((err as Error).message || "Could not load products");
    } finally {
      if (id === latest.current) setIsLoading(false);
    }
  }, [page, debounced, category, status]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (row: AdminProductSummary) => {
    setTogglingId(row.id);
    try {
      await apiClient(`/admin/products/${row.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (err) {
      setError((err as Error).message || "Could not change the product's status");
    } finally {
      setTogglingId(null);
    }
  };

  const open = (id: string) => navigate({ to: "/admin", search: { tab: "products", edit: id } });

  const statusTab = (value: StatusFilter, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={status === value}
      onClick={() => {
        setStatus(value);
        setPage(1);
      }}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
        status === value
          ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
          : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Products</h2>
          <p className="text-xs text-zinc-500 mt-1">
            {total} {total === 1 ? "product" : "products"} • edit details, variants, images and stock
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            onClick={() => navigate({ to: "/admin", search: { tab: "products", import: "1" } })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import / export
          </button>
          <button
            type="button"
            onClick={() => open("new")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:opacity-90 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New product
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand or SKU"
            aria-label="Search products"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <div role="tablist" aria-label="Status" className="flex gap-1">
          {statusTab("", "All")}
          {statusTab("active", "On sale")}
          {statusTab("inactive", "Hidden")}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Variants</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">On sale</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-zinc-500">
                    {debounced || category || status ? "No products match these filters." : "No products yet. Create the first one."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={`hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 ${row.is_active ? "" : "opacity-70"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                          {row.thumbnail ? (
                            <img src={row.thumbnail} alt="" className="max-w-full max-h-full object-contain" />
                          ) : (
                            <ImageOff className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-white truncate max-w-[260px]">{row.name}</p>
                          <p className="text-[11px] text-zinc-400 font-mono truncate max-w-[260px]">/{row.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {row.category_name}
                      <span className="block text-[11px] text-zinc-400">{row.brand_name}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{row.variant_count}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-zinc-900 dark:text-white">{row.stock_total - row.reserved_total}</span>
                      <span className="text-zinc-400"> available</span>
                      {row.reserved_total > 0 && <span className="block text-[11px] text-zinc-400">{row.reserved_total} held in checkout</span>}
                      {row.low_stock_count > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          {row.low_stock_count} low
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{formatTHB(row.min_price)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.is_active}
                        aria-label={`${row.is_active ? "Hide" : "Put on sale"}: ${row.name}`}
                        disabled={togglingId === row.id}
                        onClick={() => toggleActive(row)}
                        className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                          row.is_active ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${row.is_active ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => open(row.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-semibold cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer">
              Previous
            </button>
            <span className="text-zinc-500">
              Page {page} of {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
