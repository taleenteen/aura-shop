import { useState } from "react";
import { Plus, Check, ShoppingBag } from "lucide-react";
import type { ProductAccessoryBundle } from "@/types/api";
import { formatTHB } from "@/lib/currency";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

interface BoughtTogetherProps {
  bundles?: ProductAccessoryBundle[];
}

export function BoughtTogether({ bundles = [] }: BoughtTogetherProps) {
  const addToCart = useCartStore((state) => state.addToCart);
  const setCartOpen = useUIStore((state) => state.setCartOpen);

  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>(
    bundles.map((b) => b.id)
  );
  const [isAdding, setIsAdding] = useState(false);

  if (!bundles || bundles.length === 0) return null;

  const toggleSelect = (id: string) => {
    if (selectedBundleIds.includes(id)) {
      setSelectedBundleIds(selectedBundleIds.filter((bId) => bId !== id));
    } else {
      setSelectedBundleIds([...selectedBundleIds, id]);
    }
  };

  const handleAddBundles = async () => {
    setIsAdding(true);
    try {
      for (const b of bundles) {
        if (selectedBundleIds.includes(b.id)) {
          const accVariantId = b.accessory_product?.variants?.[0]?.id;
          if (accVariantId) {
            await addToCart(accVariantId, 1);
          }
        }
      }
      setCartOpen(true);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section className="py-16 border-t border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Frequently Bought Together
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white mt-1">
            Essential Compatible Accessories
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {bundles.map((bundle) => {
            const accProduct = bundle.accessory_product;
            if (!accProduct) return null;

            const isSelected = selectedBundleIds.includes(bundle.id);
            const discountedPrice = Math.round(
              accProduct.base_price * (1 - bundle.bundle_discount_pct / 100)
            );
            const rawImages = accProduct.variants?.[0]?.images;
            const thumb =
              (Array.isArray(rawImages) ? rawImages[0] : typeof rawImages === "string" ? rawImages : "") ||
              "";

            return (
              <div
                key={bundle.id}
                onClick={() => toggleSelect(bundle.id)}
                className={`p-6 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "border-zinc-950 dark:border-white bg-zinc-50 dark:bg-zinc-800/80 shadow-sm"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 opacity-70"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Save {bundle.bundle_discount_pct}% with bundle
                    </span>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950"
                          : "border border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                    </div>
                  </div>

                  <div className="w-full aspect-4/3 flex items-center justify-center mb-4">
                    <img
                      src={thumb}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white line-clamp-2">
                    {accProduct.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                    {accProduct.tagline}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-zinc-700/80 flex items-center gap-2">
                  <span className="font-bold text-sm text-zinc-950 dark:text-white">
                    {formatTHB(discountedPrice)}
                  </span>
                  <span className="text-xs text-zinc-400 line-through">
                    {formatTHB(accProduct.base_price)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {selectedBundleIds.length > 0 && (
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              disabled={isAdding}
              onClick={handleAddBundles}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 shadow-md cursor-pointer transition-opacity"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>
                {isAdding
                  ? "Adding..."
                  : `Add Selected Accessories (${selectedBundleIds.length})`}
              </span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
