import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { Product, ProductVariant } from "@/types/api";
import { StickyGallery } from "./sticky-gallery";
import { CTOSpecSelector } from "./cto-spec-selector";
import { BentoHighlights } from "./bento-highlights";
import { PortsAndBox } from "./ports-and-box";
import { BoughtTogether } from "./bought-together";
import { FullSpecMatrix } from "./full-spec-matrix";
import { ProductReviewsSection } from "@/features/reviews/product-reviews";

interface ProductDetailPageProps {
  slug: string;
}

export function ProductDetailPage({ slug }: ProductDetailPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ?variant=<id> opens a specific option, e.g. from a back-in-stock email.
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const wantedVariant = typeof search.variant === "string" ? search.variant : null;

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    apiClient<Product>(`/products/${slug}`)
      .then((res) => {
        setProduct(res.data);
        const variants = res.data?.variants ?? [];
        if (variants.length > 0) {
          setSelectedVariant(variants.find((v) => v.id === wantedVariant) ?? variants[0]);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load product specifications");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [slug]);

  if (isLoading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Configuring hardware options...</span>
      </div>
    );
  }

  if (error || !product || !selectedVariant) {
    return (
      <div className="py-32 max-w-lg mx-auto text-center px-4">
        <h2 className="text-2xl font-bold text-zinc-950 dark:text-white">
          Product Not Found
        </h2>
        <p className="text-xs text-zinc-500 mt-2">
          {error || "The hardware model you requested is not currently active."}
        </p>
        <Link
          to="/catalog"
          className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-semibold"
        >
          Return to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Breadcrumb Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-zinc-500 overflow-x-auto">
          <Link to="/" className="hover:text-zinc-900 dark:hover:text-white">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <Link to="/catalog" className="hover:text-zinc-900 dark:hover:text-white">
            Catalog
          </Link>
          {product.category && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <Link
                to="/catalog"
                search={{ category: product.category.slug }}
                className="hover:text-zinc-900 dark:hover:text-white"
              >
                {product.category.name}
              </Link>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold truncate max-w-[200px]">
            {product.name}
          </span>
        </div>
      </div>

      {/* Two-Column Top Configurator Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Left Column: Sticky Gallery */}
          <div className="lg:col-span-6 xl:col-span-7">
            <StickyGallery
              selectedVariant={selectedVariant}
              productName={product.name}
            />
          </div>

          {/* Right Column: CTO Spec Selector */}
          <div className="lg:col-span-6 xl:col-span-5">
            <CTOSpecSelector
              product={product}
              selectedVariant={selectedVariant}
              onSelectVariant={setSelectedVariant}
            />
          </div>
        </div>
      </section>

      {/* Frequently Bought Together Bundle */}
      <BoughtTogether bundles={product.accessory_bundles} />

      {/* 6-Card Bento Highlights */}
      <BentoHighlights
        highlights={product.bento_highlights}
        productName={product.name}
      />

      {/* Ports Diagram & Box Contents */}
      <PortsAndBox
        portsDiagram={product.ports_diagram}
        boxContents={product.box_contents}
      />

      {/* Full Technical Specifications Matrix */}
      <FullSpecMatrix specGroups={product.full_spec_matrix} />

      {/* Customer reviews */}
      <ProductReviewsSection slug={product.slug} />
    </div>
  );
}
