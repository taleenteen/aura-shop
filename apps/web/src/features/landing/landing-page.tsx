import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { HeroSplitBanner } from "@/features/banner/hero-split-banner";
import { BentoPromoGrid } from "@/features/banner/bento-promo-grid";
import { PersonaQuickLinks } from "@/features/catalog/persona-quick-links";
import { ProductCard } from "@/features/catalog/product-card";
import { apiClient } from "@/lib/api-client";
import type { Product } from "@/types/api";
import { useStorefrontStore } from "@/stores/storefront-store";

export function LandingPage() {
  const banners = useStorefrontStore((state) => state.banners);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  useEffect(() => {
    // Fetch top featured flagship products
    apiClient<Product[]>("/catalog?limit=6")
      .then((res) => {
        if (res.data) setFeaturedProducts(res.data);
      })
      .catch(() => {});
  }, []);

  const heroBanner = banners.HERO_SPLIT?.[0];
  const bentoBanners = banners.BENTO_GRID || [];

  return (
    <div className="w-full flex flex-col">
      {/* 1. Hero Split Flagship Banner */}
      <HeroSplitBanner banner={heroBanner} />

      {/* 2. Usage Persona Quick-Links */}
      <PersonaQuickLinks />

      {/* 3. Featured Flagship Models Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Flagship Hardware</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
              MacBook, ROG & Ultrabook Lineup
            </h2>
          </div>

          <Link
            to="/catalog"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white hover:underline underline-offset-4"
          >
            <span>Explore All Models</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Phones: a swipeable row that snaps card by card, with the next card peeking in.
            sm and up: the regular grid. */}
        <div
          role="region"
          aria-label="Flagship models"
          className="-mx-4 px-4 flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-6 sm:overflow-visible sm:pb-0"
        >
          {featuredProducts.map((product) => (
            <div key={product.id} className="snap-start shrink-0 w-[82%] sm:w-auto">
              <ProductCard product={product} className="h-full" />
            </div>
          ))}
        </div>
        {featuredProducts.length > 1 && (
          <p className="sm:hidden mt-3 text-center text-[11px] text-zinc-400">Swipe to see more</p>
        )}
      </section>

      {/* 4. Bento Promo Campaign Grid */}
      <BentoPromoGrid banners={bentoBanners} />
    </div>
  );
}
