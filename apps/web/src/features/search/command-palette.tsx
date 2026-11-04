import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X, Laptop, ArrowRight, Loader2 } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { apiClient } from "@/lib/api-client";
import type { Product } from "@/types/api";
import { formatTHB } from "@/lib/currency";

export function CommandPalette() {
  const isOpen = useUIStore((state) => state.isCommandPaletteOpen);
  const setIsOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient<Product[]>(
          `/search?q=${encodeURIComponent(query)}`
        );
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Arrow key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? results.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex].slug);
    }
  };

  const handleSelect = (slug: string) => {
    setIsOpen(false);
    navigate({
      to: "/products/$slug",
      params: { slug },
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[80vh]"
          >
            {/* Search Input Bar */}
            <div className="flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800 h-14 shrink-0">
              <Search className="w-5 h-5 text-zinc-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search MacBook, ROG, Keychron, or spec (e.g. 24GB, M4 Pro)..."
                className="w-full h-full px-3 text-sm bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0" />
              ) : query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {/* Results List */}
            <div className="overflow-y-auto p-2 divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {results.length > 0 ? (
                results.map((product, idx) => {
                  const isSelected = idx === selectedIndex;
                  const thumb =
                    (Array.isArray(product.variants?.[0]?.images) &&
                      product.variants[0].images[0]) ||
                    "";

                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => handleSelect(product.slug)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-zinc-100 dark:bg-zinc-800"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <Laptop className="w-5 h-5 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                            {product.name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {product.tagline || product.brand?.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 pl-3">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white">
                          {formatTHB(product.base_price)}
                        </span>
                        <ArrowRight className="w-4 h-4 text-zinc-400" />
                      </div>
                    </button>
                  );
                })
              ) : query.trim() && !isLoading ? (
                <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No matching gadgets or specifications found for "{query}".
                </div>
              ) : (
                <div className="py-8 px-4 text-xs text-zinc-400 space-y-2">
                  <div className="font-semibold uppercase tracking-wider text-zinc-500">
                    Quick Suggestions
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["MacBook Pro M4", "ROG Zephyrus OLED", "Yoga Slim 7i", "Keychron Q1", "UltraFine 5K"].map(
                      (item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setQuery(item)}
                          className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Shortcut Guide */}
            <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between text-[11px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Open</span>
                <span>ESC Close</span>
              </div>
              <span className="font-medium text-zinc-400">
                AURA TECH Instant Trigram Search
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
