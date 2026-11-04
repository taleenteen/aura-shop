import React, { useRef } from "react";
import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import type { Product } from "@/types/api";
import { formatTHB, formatMonthlyInstallment } from "@/lib/currency";
import { WishlistHeartButton } from "@/features/wishlist/wishlist-heart-button";
import { useCompareStore } from "@/stores/compare-store";
import { apiClient } from "@/lib/api-client";

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className = "" }: ProductCardProps) {
  const queryClient = useQueryClient();
  const hoverTimeoutRef = useRef<number | null>(null);

  const isCompared = useCompareStore((state) => state.isCompared(product.slug));
  const addSlug = useCompareStore((state) => state.addSlug);
  const removeSlug = useCompareStore((state) => state.removeSlug);

  // Intent-based Prefetching on 150ms hover
  const handleMouseEnter = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["product", product.slug],
        queryFn: () =>
          apiClient<Product>(`/products/${product.slug}`).then((r) => r.data),
        staleTime: 5 * 60 * 1000,
      });
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const toggleCompare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCompared) {
      removeSlug(product.slug);
    } else {
      addSlug(product.slug);
    }
  };

  const primaryVariant = product.variants?.[0];
  const primaryImage =
    (Array.isArray(primaryVariant?.images) && primaryVariant.images[0]) ||
    "/placeholder-laptop.webp";

  return (
    <motion.div
      layout
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative flex flex-col justify-between rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors duration-200 hover:border-zinc-400 dark:hover:border-zinc-600 p-5 overflow-hidden shadow-xs ${className}`}
    >
      {/* Top Floating Actions */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-auto">
        {/* Compare Toggle Pill */}
        <button
          type="button"
          onClick={toggleCompare}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full backdrop-blur-md transition-all cursor-pointer ${
            isCompared
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
              : "bg-white/80 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          {isCompared ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Comparing</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Compare</span>
            </>
          )}
        </button>

        {/* 4-State Wishlist Button */}
        <WishlistHeartButton productId={product.id} size="sm" />
      </div>

      {/* Product Image Area with inner zoom */}
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="block pt-8 pb-4"
      >
        <div className="relative aspect-4/3 w-full flex items-center justify-center overflow-hidden">
          <motion.img
            src={primaryImage}
            alt={product.name}
            loading="lazy"
            whileHover={{ scale: 1.03 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full h-full object-contain filter drop-shadow-md select-none"
          />
        </div>
      </Link>

      {/* Product Meta & Typography */}
      <div className="flex flex-col flex-1 justify-between pt-2">
        <div>
          {/* Brand & Persona Pills */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {product.brand && (
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
                {product.brand.name}
              </span>
            )}
            {product.usage_personas?.[0] && (
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                {product.usage_personas[0]}
              </span>
            )}
          </div>

          {/* Product Title */}
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="block group-hover:text-zinc-900 dark:group-hover:text-white transition-colors"
          >
            <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
              {product.name}
            </h3>
          </Link>

          {/* Tagline / Chip summary */}
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">
            {product.tagline || product.short_description}
          </p>

          {/* Color Finish Swatches */}
          {product.variants && product.variants.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              {Array.from(
                new Map(product.variants.map((v) => [v.color_name, v])).values()
              ).map((v) => (
                <span
                  key={v.id}
                  title={v.color_name}
                  style={{ backgroundColor: v.color_hex }}
                  className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-2xs"
                />
              ))}
            </div>
          )}
        </div>

        {/* Pricing & 0% Installment */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 mt-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">From</div>
          <div className="text-lg font-bold text-zinc-950 dark:text-white tracking-tight">
            {formatTHB(product.base_price)}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
            0% {formatMonthlyInstallment(product.base_price, 10)}
          </div>

          <div className="mt-3">
            <Link
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="w-full inline-flex items-center justify-center py-2 px-3 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 transition-colors"
            >
              Configure & Buy
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
