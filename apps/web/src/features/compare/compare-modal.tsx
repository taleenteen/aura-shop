import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, SlidersHorizontal, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCompareStore } from "@/stores/compare-store";
import { useUIStore } from "@/stores/ui-store";
import { apiClient } from "@/lib/api-client";
import type { Product } from "@/types/api";
import { formatTHB } from "@/lib/currency";

export function CompareModal() {
  const isOpen = useUIStore((state) => state.isCompareOpen);
  const setIsOpen = useUIStore((state) => state.setCompareOpen);

  const comparedSlugs = useCompareStore((state) => state.comparedSlugs);
  const removeSlug = useCompareStore((state) => state.removeSlug);
  const highlightOnlyDiffs = useCompareStore(
    (state) => state.highlightDifferencesOnly
  );
  const setHighlightOnlyDiffs = useCompareStore(
    (state) => state.setHighlightDifferencesOnly
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || comparedSlugs.length === 0) {
      return;
    }

    setIsLoading(true);
    apiClient<Product[]>(`/products/compare?slugs=${comparedSlugs.join(",")}`)
      .then((res) => {
        setProducts(res.data || []);
      })
      .catch(() => {
        setProducts([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, comparedSlugs]);

  if (!isOpen) return null;

  // Spec definition extractor
  const specRows = [
    {
      label: "Starting Price",
      getValue: (p: Product) => formatTHB(p.base_price),
    },
    {
      label: "Processor Family",
      getValue: (p: Product) =>
        p.variants?.[0]?.specs?.cpu_family || "Standard",
    },
    {
      label: "Cores & Architecture",
      getValue: (p: Product) =>
        p.variants?.[0]?.specs?.cpu_detail || "Multi-core",
    },
    {
      label: "Standard Unified Memory",
      getValue: (p: Product) =>
        p.variants?.[0]?.specs?.ram_gb
          ? `${p.variants[0].specs.ram_gb} GB`
          : "N/A",
    },
    {
      label: "Base SSD Storage",
      getValue: (p: Product) => {
        const gb = p.variants?.[0]?.specs?.storage_gb;
        if (!gb) return "N/A";
        return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
      },
    },
    {
      label: "Display Size & Panel",
      getValue: (p: Product) => {
        const s = p.variants?.[0]?.specs;
        if (!s) return "N/A";
        return `${s.screen_size_inch}" ${s.panel_type}`;
      },
    },
    {
      label: "Refresh Rate",
      getValue: (p: Product) =>
        p.variants?.[0]?.specs?.refresh_rate_hz
          ? `${p.variants[0].specs.refresh_rate_hz} Hz`
          : "60 Hz",
    },
    {
      label: "Weight",
      getValue: (p: Product) =>
        p.variants?.[0]?.specs?.weight_kg
          ? `${p.variants[0].specs.weight_kg} kg`
          : "N/A",
    },
    {
      label: "Thunderbolt 5 / 4",
      getValue: (p: Product) =>
        p.variants?.[0]?.specs?.has_thunderbolt ? "Yes" : "No",
    },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                  Side-by-Side Model Comparison
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Comparing up to 3 flagship systems
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Highlight Differences Only Toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={highlightOnlyDiffs}
                  onChange={(e) => setHighlightOnlyDiffs(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950 cursor-pointer"
                />
                <span>Highlight Differences Only</span>
              </label>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Comparison Body */}
          <div className="overflow-y-auto flex-1 p-6" data-lenis-prevent>
            {isLoading ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Loading model specifications...</span>
              </div>
            ) : products.length === 0 ? (
              <div className="py-24 text-center text-sm text-zinc-500">
                Select laptops from the catalog or product page to compare.
              </div>
            ) : (
              <div>
                {/* Product Headers Columns */}
                <div
                  className="grid gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800"
                  style={{
                    gridTemplateColumns: `180px repeat(${products.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="font-semibold text-xs text-zinc-400 self-end pb-2">
                    System Model
                  </div>
                  {products.map((p) => {
                    const thumb =
                      (Array.isArray(p.variants?.[0]?.images) &&
                        p.variants[0].images[0]) ||
                      "";
                    return (
                      <div
                        key={p.id}
                        className="flex flex-col items-center text-center p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 relative"
                      >
                        <button
                          type="button"
                          onClick={() => removeSlug(p.slug)}
                          className="absolute top-2 right-2 p-1 rounded-full text-zinc-400 hover:text-rose-500 cursor-pointer"
                          title="Remove from comparison"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>

                        <div className="w-24 h-20 flex items-center justify-center mb-2">
                          <img
                            src={thumb}
                            alt=""
                            className="max-h-full max-w-full object-contain filter drop-shadow-sm"
                          />
                        </div>

                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white line-clamp-1">
                          {p.name}
                        </h4>
                        <div className="text-xs font-bold text-zinc-950 dark:text-white mt-1">
                          {formatTHB(p.base_price)}
                        </div>

                        <Link
                          to="/products/$slug"
                          params={{ slug: p.slug }}
                          onClick={() => setIsOpen(false)}
                          className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 transition-colors"
                        >
                          <span>Configure</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    );
                  })}
                </div>

                {/* Specs Rows */}
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 mt-4">
                  {specRows.map((row) => {
                    const values = products.map((p) => row.getValue(p));
                    const isAllIdentical = values.every((v) => v === values[0]);

                    // If "Highlight Differences Only" is active and all are identical, skip row
                    if (highlightOnlyDiffs && isAllIdentical) {
                      return null;
                    }

                    return (
                      <div
                        key={row.label}
                        className={`grid gap-4 py-3.5 items-center transition-colors text-xs ${
                          !isAllIdentical
                            ? "bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl px-2"
                            : ""
                        }`}
                        style={{
                          gridTemplateColumns: `180px repeat(${products.length}, minmax(0, 1fr))`,
                        }}
                      >
                        <div className="font-semibold text-zinc-600 dark:text-zinc-400">
                          {row.label}
                        </div>
                        {values.map((val, idx) => (
                          <div
                            key={idx}
                            className={`text-center font-medium ${
                              !isAllIdentical
                                ? "text-emerald-700 dark:text-emerald-400 font-bold"
                                : "text-zinc-800 dark:text-zinc-200"
                            }`}
                          >
                            {val}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
