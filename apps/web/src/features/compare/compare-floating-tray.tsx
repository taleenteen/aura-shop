import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SlidersHorizontal, X, ArrowRight } from "lucide-react";
import { MAX_COMPARE, useCompareStore } from "@/stores/compare-store";
import { useUIStore } from "@/stores/ui-store";

export function CompareFloatingTray() {
  const comparedSlugs = useCompareStore((state) => state.comparedSlugs);
  const removeSlug = useCompareStore((state) => state.removeSlug);
  const clearCompare = useCompareStore((state) => state.clearCompare);
  const setCompareOpen = useUIStore((state) => state.setCompareOpen);
  const limitHitAt = useCompareStore((state) => state.limitHitAt);
  const [showLimitNotice, setShowLimitNotice] = useState(false);

  useEffect(() => {
    if (!limitHitAt) return;
    setShowLimitNotice(true);
    const t = setTimeout(() => setShowLimitNotice(false), 3500);
    return () => clearTimeout(t);
  }, [limitHitAt]);

  if (comparedSlugs.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.aside
        aria-label="Product Comparison Tray"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-2xl bg-zinc-950/90 text-white backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-3 sm:p-4 flex items-center justify-between gap-4"
      >
        {showLimitNotice && (
          <p
            role="status"
            className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold shadow-lg"
          >
            You can compare up to {MAX_COMPARE} products. Remove one to add another.
          </p>
        )}
        <div className="flex items-center gap-3 overflow-x-auto min-w-0 py-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <span>Compare ({comparedSlugs.length}/{MAX_COMPARE})</span>
          </div>

          <div className="flex items-center gap-2">
            {comparedSlugs.map((slug) => (
              <div
                key={slug}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 text-xs font-medium border border-zinc-700 text-zinc-200 shrink-0"
              >
                <span className="truncate max-w-[120px]">{slug}</span>
                <button
                  type="button"
                  onClick={() => removeSlug(slug)}
                  className="p-0.5 hover:text-white cursor-pointer"
                  aria-label={`Remove ${slug}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={clearCompare}
            className="text-xs text-zinc-400 hover:text-white px-2 py-1 cursor-pointer transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-zinc-950 font-semibold text-xs hover:bg-zinc-100 transition-colors cursor-pointer shadow-md"
          >
            <span>Open Comparison</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
