import { useCallback, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { ProductReviews, Review } from "@/types/api";
import { z } from "zod";
import { validate, optionalText } from "@/lib/validation";

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  title: optionalText(120, "Keep the title under 120 characters."),
  body: optionalText(2000, "Keep the review under 2,000 characters."),
});

const PAGE_SIZE = 5;

/** Read-only stars; `value` may be fractional (rounded to the nearest half). */
export function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? "100%" : rounded >= i - 0.5 ? "50%" : "0%";
        return (
          <span key={i} className={`relative ${size}`} aria-hidden>
            <Star className={`absolute inset-0 ${size} text-zinc-300 dark:text-zinc-600`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: fill }}>
              <Star className={`${size} text-amber-400 fill-amber-400`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Product page: rating summary, published reviews, and the signed-in buyer's own review. */
export function ProductReviewsSection({ slug }: { slug: string }) {
  const userId = useAuthStore((s) => s.user?.id);
  const setAuthOpen = useUIStore((s) => s.setAuthOpen);
  const [data, setData] = useState<ProductReviews | null>(null);
  const [extra, setExtra] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient<ProductReviews>(`/products/${slug}/reviews?limit=${PAGE_SIZE}`);
      setData(res.data);
      setExtra([]);
      setPage(1);
      setTotalPages(Math.max(1, res.meta?.total_pages ?? 1));
    } catch {
      setData({ summary: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] }, reviews: [], viewer: null });
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load, userId]);

  // Links to "#reviews" (e.g. "Rate & review" in My Orders) arrive before this section exists.
  const loaded = data !== null;
  useEffect(() => {
    if (loaded && window.location.hash === "#reviews") {
      document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loaded]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await apiClient<ProductReviews>(`/products/${slug}/reviews?limit=${PAGE_SIZE}&page=${page + 1}`);
      setExtra((x) => [...x, ...res.data.reviews]);
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!data) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex justify-center text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </section>
    );
  }

  const { summary, viewer } = data;
  const reviews = [...data.reviews, ...extra];
  const mine = viewer?.my_review;

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full scroll-mt-24">
      <h2 id="reviews-heading" className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white mb-8">
        Customer reviews
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Summary + your review */}
        <div className="lg:col-span-4 space-y-6">
          <div className="space-y-2">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black text-zinc-950 dark:text-white">{summary.count ? summary.average.toFixed(1) : "–"}</span>
              <div className="pb-1.5">
                <Stars value={summary.average} />
                <p className="text-xs text-zinc-500 mt-0.5">
                  {summary.count} {summary.count === 1 ? "review" : "reviews"} from verified buyers
                </p>
              </div>
            </div>
            <ul className="space-y-1.5 pt-2" aria-label="Rating breakdown">
              {[5, 4, 3, 2, 1].map((star) => {
                const n = summary.distribution[star - 1];
                const pct = summary.count ? (n / summary.count) * 100 : 0;
                return (
                  <li key={star} className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="w-3 text-right">{star}</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden />
                    <span className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
            {!userId ? (
              <>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Bought this?</p>
                <p className="text-xs text-zinc-500">Sign in to review it once your order has been delivered.</p>
                <button type="button" onClick={() => setAuthOpen(true)} className="px-4 py-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold cursor-pointer">
                  Sign in
                </button>
              </>
            ) : mine && !editing ? (
              <>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Your review</p>
                <Stars value={mine.rating} />
                {mine.title && <p className="text-sm font-semibold text-zinc-900 dark:text-white">{mine.title}</p>}
                {mine.body && <p className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line">{mine.body}</p>}
                {mine.is_hidden && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">This review is hidden from the product page because it didn't meet our review guidelines.</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold cursor-pointer">
                    Edit
                  </button>
                  <DeleteMyReview slug={slug} onDone={load} />
                </div>
              </>
            ) : viewer?.can_review ? (
              <ReviewForm
                slug={slug}
                initial={mine ?? undefined}
                onCancel={mine ? () => setEditing(false) : undefined}
                onSaved={() => {
                  setEditing(false);
                  load();
                }}
              />
            ) : (
              <>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Share your experience</p>
                <p className="text-xs text-zinc-500">You can review this product once an order containing it has been delivered.</p>
              </>
            )}
          </div>
        </div>

        {/* Review list */}
        <div className="lg:col-span-8">
          {reviews.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
              No reviews yet. Buyers can review once their order arrives.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {reviews.map((r) => (
                <li key={r.id} className="py-5 first:pt-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars value={r.rating} size="w-3.5 h-3.5" />
                    {r.title && <p className="text-sm font-semibold text-zinc-900 dark:text-white">{r.title}</p>}
                  </div>
                  {r.body && <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line leading-relaxed">{r.body}</p>}
                  <p className="text-[11px] text-zinc-400">
                    {r.author_name} • Verified buyer • {fmtDate(r.created_at)}
                    {r.updated_at.slice(0, 16) !== r.created_at.slice(0, 16) && " (edited)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {page < totalPages && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Show more reviews
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewForm({
  slug,
  initial,
  onCancel,
  onSaved,
}: {
  slug: string;
  initial?: { rating: number; title: string; body: string };
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = validate(reviewSchema, { rating, title, body });
    if (!checked.ok) return setErrors(checked.fields);
    setBusy(true);
    setErrors({});
    try {
      await apiClient(`/products/${slug}/reviews/mine`, { method: "PUT", body: JSON.stringify(checked.data) });
      onSaved();
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setErrors(apiErr.fields ?? { form: apiErr.message || "Could not save your review." });
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white";
  const shown = hover || rating;

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{initial ? "Edit your review" : "Write a review"}</p>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={`${i} star${i > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => setRating(i)}
            className="p-0.5 cursor-pointer"
          >
            <Star className={`w-6 h-6 ${i <= shown ? "text-amber-400 fill-amber-400" : "text-zinc-300 dark:text-zinc-600"}`} />
          </button>
        ))}
      </div>
      {errors.rating && <p className="text-[11px] text-rose-600">{errors.rating}</p>}
      <div>
        <label htmlFor="review-title" className="sr-only">Title</label>
        <input id="review-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className={field} />
        {errors.title && <p className="mt-1 text-[11px] text-rose-600">{errors.title}</p>}
      </div>
      <div>
        <label htmlFor="review-body" className="sr-only">Review</label>
        <textarea id="review-body" value={body} rows={4} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="What did you like or dislike?" className={field} />
        {errors.body && <p className="mt-1 text-[11px] text-rose-600">{errors.body}</p>}
      </div>
      {errors.form && <p role="alert" className="text-xs text-rose-600">{errors.form}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold disabled:opacity-50 cursor-pointer">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {initial ? "Save review" : "Post review"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold cursor-pointer">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function DeleteMyReview({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await apiClient(`/products/${slug}/reviews/mine`, { method: "DELETE" });
      onDone();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return confirming ? (
    <span className="inline-flex gap-2">
      <button type="button" disabled={busy} onClick={run} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50">
        Delete
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold cursor-pointer">
        Keep
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className="px-3 py-1.5 rounded-xl text-rose-600 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
      Delete
    </button>
  );
}
