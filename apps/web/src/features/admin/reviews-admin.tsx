import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { AdminReview } from "@/types/api";
import { Stars } from "@/features/reviews/product-reviews";

type Status = "" | "visible" | "hidden";
const PAGE_SIZE = 20;

/** Admin › Reviews: read every review and hide ones that break the guidelines. */
export function ReviewsAdmin() {
  const [rows, setRows] = useState<AdminReview[]>([]);
  const [status, setStatus] = useState<Status>("");
  const [rating, setRating] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (rating) params.set("rating", rating);
    if (debounced) params.set("q", debounced);
    try {
      const res = await apiClient<AdminReview[]>(`/admin/reviews?${params}`);
      if (id !== latest.current) return;
      setRows(res.data || []);
      setTotal(res.meta?.total_items ?? 0);
      setTotalPages(Math.max(1, res.meta?.total_pages ?? 1));
    } catch (err) {
      if (id === latest.current) setError((err as Error).message || "Could not load reviews.");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, status, rating, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (r: AdminReview) => {
    setBusyId(r.id);
    try {
      await apiClient(`/admin/reviews/${r.id}`, { method: "PATCH", body: JSON.stringify({ is_hidden: !r.is_hidden }) });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, is_hidden: !x.is_hidden } : x)));
    } catch (err) {
      setError((err as Error).message || "Could not update the review.");
    } finally {
      setBusyId(null);
    }
  };

  const tab = (value: Status, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={status === value}
      onClick={() => {
        setStatus(value);
        setPage(1);
      }}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
        status === value ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Reviews</h2>
        <p className="text-xs text-zinc-500 mt-1">
          {total} {total === 1 ? "review" : "reviews"} • only customers with a delivered order can review. Hidden reviews leave the product page and its rating; the author still sees theirs.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product, email or text"
            aria-label="Search reviews"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
        </div>
        <select
          value={rating}
          onChange={(e) => {
            setRating(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by rating"
          className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <div role="tablist" aria-label="Visibility" className="flex gap-1">
          {tab("", "All")}
          {tab("visible", "Visible")}
          {tab("hidden", "Hidden")}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}

      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-14 flex justify-center text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-14 text-center text-xs text-zinc-500">{debounced || status || rating ? "No reviews match these filters." : "No reviews yet."}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <li key={r.id} className={`p-4 flex flex-col sm:flex-row gap-3 ${r.is_hidden ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} size="w-3.5 h-3.5" />
                    <Link to="/products/$slug" params={{ slug: r.product_slug }} hash="reviews" className="text-xs font-semibold text-zinc-900 dark:text-white hover:underline underline-offset-2">
                      {r.product_name}
                    </Link>
                    {r.is_hidden && <span className="px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Hidden</span>}
                  </div>
                  {r.title && <p className="text-sm font-semibold text-zinc-900 dark:text-white">{r.title}</p>}
                  {r.body && <p className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line line-clamp-4">{r.body}</p>}
                  <p className="text-[11px] text-zinc-400">
                    {r.author_name} • {r.author_email} • {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => toggle(r)}
                  className="self-start shrink-0 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {r.is_hidden ? "Show" : "Hide"}
                </button>
              </li>
            ))}
          </ul>
        )}
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
