import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { HeroSplitBanner } from "@/features/banner/hero-split-banner";
import { BentoPromoGrid } from "@/features/banner/bento-promo-grid";
import { PersonaQuickLinks } from "@/features/catalog/persona-quick-links";
import { ProductCard } from "@/features/catalog/product-card";
import { apiClient } from "@/lib/api-client";
import type { Banner, Product } from "@/types/api";

export function LandingPage() {
  const [banners, setBanners] = useState<Record<string, Banner[]>>({
    HERO_SPLIT: [],
    BENTO_GRID: [],
    TOP_RIBBON: [],
  });
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  useEffect(() => {
    // Fetch dynamic component banners
    apiClient<Record<string, Banner[]>>("/banners")
      .then((res) => {
        if (res.data) setBanners(res.data);
      })
      .catch(() => {});

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* 4. Bento Promo Campaign Grid */}
      <BentoPromoGrid banners={bentoBanners} />
    </div>
  );
}
