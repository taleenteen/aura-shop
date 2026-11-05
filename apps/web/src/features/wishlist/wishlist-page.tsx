import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useWishlistStore } from "@/stores/wishlist-store";
import { ProductCard } from "@/features/catalog/product-card";
import type { Product, Wishlist } from "@/types/api";

export function WishlistPage() {
  const likedIds = useWishlistStore((state) => state.likedIds);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient<Wishlist[]>("/wishlist")
      .then((res) => {
        if (!cancelled) setProducts((res.data || []).map((item) => item.product));
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Failed to load wishlist");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Un-hearting a card updates the store immediately; hide it without refetching.
  const visible = products.filter((p) => likedIds.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
          Your Wishlist
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {isLoading ? "Loading saved products…" : `${visible.length} saved ${visible.length === 1 ? "product" : "products"}`}
        </p>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <p role="alert" className="py-12 text-center text-sm text-rose-600 dark:text-rose-400">
          Could not load your wishlist: {error}
        </p>
      ) : visible.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <Heart className="w-10 h-10 mx-auto text-zinc-300" />
          <h2 className="font-bold text-zinc-900 dark:text-white">No saved products yet</h2>
          <p className="text-sm text-zinc-500">Tap the heart on any product to keep it here.</p>
          <Link
            to="/catalog"
            className="inline-block mt-2 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold text-xs hover:opacity-90"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
