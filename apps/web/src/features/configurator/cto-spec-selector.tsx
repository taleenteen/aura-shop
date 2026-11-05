import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { ShoppingBag, Check, HelpCircle, ShieldCheck } from "lucide-react";
import type { Product, ProductVariant } from "@/types/api";
import { formatMonthlyInstallment, calculatePriceDelta } from "@/lib/currency";
import { AnimatedPrice } from "@/components/ui/animated-price";
import { HelpModal } from "@/features/configurator/help-modal";
import { NotifyMe } from "./notify-me";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

interface CTOSpecSelectorProps {
  product: Product;
  selectedVariant: ProductVariant;
  onSelectVariant: (variant: ProductVariant) => void;
}

export function CTOSpecSelector({
  product,
  selectedVariant,
  onSelectVariant,
}: CTOSpecSelectorProps) {
  const addToCart = useCartStore((state) => state.addToCart);
  const setCartOpen = useUIStore((state) => state.setCartOpen);

  const [helpModalType, setHelpModalType] = useState<"memory" | "storage" | null>(
    null
  );
  const [isAdding, setIsAdding] = useState(false);

  // Group variants by distinct attributes
  const colors = useMemo(() => {
    const map = new Map<string, { name: string; hex: string }>();
    product.variants.forEach((v) => {
      if (!map.has(v.color_name)) {
        map.set(v.color_name, { name: v.color_name, hex: v.color_hex });
      }
    });
    return Array.from(map.values());
  }, [product.variants]);

  const chips = useMemo(() => {
    const set = new Set<string>();
    product.variants.forEach((v) => {
      if (v.specs?.cpu_family) set.add(v.specs.cpu_family);
    });
    return Array.from(set);
  }, [product.variants]);

  const ramOptions = useMemo(() => {
    const set = new Set<number>();
    product.variants.forEach((v) => {
      if (v.specs?.ram_gb) set.add(v.specs.ram_gb);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [product.variants]);

  const storageOptions = useMemo(() => {
    const set = new Set<number>();
    product.variants.forEach((v) => {
      if (v.specs?.storage_gb) set.add(v.specs.storage_gb);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [product.variants]);

  // Match best variant when an attribute changes
  const handleColorChange = (colorName: string) => {
    const match =
      product.variants.find(
        (v) =>
          v.color_name === colorName &&
          v.specs?.cpu_family === selectedVariant.specs?.cpu_family &&
          v.specs?.ram_gb === selectedVariant.specs?.ram_gb &&
          v.specs?.storage_gb === selectedVariant.specs?.storage_gb
      ) ||
      product.variants.find((v) => v.color_name === colorName) ||
      selectedVariant;
    onSelectVariant(match);
  };

  const handleChipChange = (cpuFamily: string) => {
    const match =
      product.variants.find(
        (v) =>
          v.color_name === selectedVariant.color_name &&
          v.specs?.cpu_family === cpuFamily &&
          v.specs?.ram_gb === selectedVariant.specs?.ram_gb &&
          v.specs?.storage_gb === selectedVariant.specs?.storage_gb
      ) ||
      product.variants.find(
        (v) =>
          v.color_name === selectedVariant.color_name &&
          v.specs?.cpu_family === cpuFamily
      ) ||
      product.variants.find((v) => v.specs?.cpu_family === cpuFamily) ||
      selectedVariant;
    onSelectVariant(match);
  };

  const handleRamChange = (ramGb: number) => {
    const match =
      product.variants.find(
        (v) =>
          v.color_name === selectedVariant.color_name &&
          v.specs?.cpu_family === selectedVariant.specs?.cpu_family &&
          v.specs?.ram_gb === ramGb &&
          v.specs?.storage_gb === selectedVariant.specs?.storage_gb
      ) ||
      product.variants.find(
        (v) =>
          v.color_name === selectedVariant.color_name &&
          v.specs?.ram_gb === ramGb
      ) ||
      product.variants.find((v) => v.specs?.ram_gb === ramGb) ||
      selectedVariant;
    onSelectVariant(match);
  };

  const handleStorageChange = (storageGb: number) => {
    const match =
      product.variants.find(
        (v) =>
          v.color_name === selectedVariant.color_name &&
          v.specs?.cpu_family === selectedVariant.specs?.cpu_family &&
          v.specs?.ram_gb === selectedVariant.specs?.ram_gb &&
          v.specs?.storage_gb === storageGb
      ) ||
      product.variants.find(
        (v) =>
          v.color_name === selectedVariant.color_name &&
          v.specs?.storage_gb === storageGb
      ) ||
      product.variants.find((v) => v.specs?.storage_gb === storageGb) ||
      selectedVariant;
    onSelectVariant(match);
  };

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      await addToCart(selectedVariant.id, 1);
      setCartOpen(true);
    } catch {
      // Error handled in store
    } finally {
      setIsAdding(false);
    }
  };

  const availableStock =
    selectedVariant.stock_quantity - selectedVariant.reserved_stock;

  return (
    <div className="w-full space-y-10">
      {/* Product Title Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          {product.brand && (
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              {product.brand.name}
            </span>
          )}
          <span className="text-zinc-400">•</span>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {availableStock > 0 ? "In Stock — Ready to ship" : "Out of stock"}
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 dark:text-white">
          {product.name}
        </h1>
        <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
          {product.tagline || product.short_description}
        </p>
      </div>

      {/* Step 1: Choose Finish (Color) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
            1. Choose Your Finish:{" "}
            <span className="text-zinc-500 font-medium">
              {selectedVariant.color_name}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-3">
          {colors.map((c) => {
            const isSelected = selectedVariant.color_name === c.name;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => handleColorChange(c.name)}
                title={c.name}
                className={`relative w-9 h-9 rounded-full flex items-center justify-center p-0.5 transition-transform hover:scale-110 cursor-pointer ${
                  isSelected ? "scale-105" : ""
                }`}
              >
                {isSelected && (
                  <motion.span
                    layoutId="color-ring"
                    className="absolute inset-0 rounded-full border-2 border-zinc-950 dark:border-white"
                  />
                )}
                <span
                  style={{ backgroundColor: c.hex }}
                  className="w-full h-full rounded-full border border-black/10 dark:border-white/10 shadow-xs"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Choose Chip (CPU/GPU) */}
      {chips.length > 1 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
            2. Choose Your Processor & Chip
          </h3>

          <div className="grid grid-cols-1 gap-2.5">
            {chips.map((cpuFamily) => {
              const isSelected = selectedVariant.specs?.cpu_family === cpuFamily;
              const matchingVar = product.variants.find(
                (v) =>
                  v.color_name === selectedVariant.color_name &&
                  v.specs?.cpu_family === cpuFamily
              ) || product.variants.find((v) => v.specs?.cpu_family === cpuFamily);

              const priceDelta = matchingVar
                ? calculatePriceDelta(matchingVar.price, selectedVariant.price)
                : null;

              return (
                <button
                  key={cpuFamily}
                  type="button"
                  onClick={() => handleChipChange(cpuFamily)}
                  className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "border-zinc-950 dark:border-white bg-zinc-50/80 dark:bg-zinc-800/80 ring-1 ring-zinc-950 dark:ring-white"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-zinc-900 dark:text-white">
                      {cpuFamily}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {matchingVar?.specs?.cpu_detail || "High performance architecture"}
                    </div>
                  </div>

                  <div className="text-xs font-semibold">
                    {isSelected ? (
                      <span className="text-zinc-500">Selected</span>
                    ) : priceDelta ? (
                      <span className="text-zinc-900 dark:text-white">
                        {priceDelta.sign} ฿{Math.abs(priceDelta.delta) / 100}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Choose Unified Memory (RAM) */}
      {ramOptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
              3. Choose Unified Memory (RAM)
            </h3>
            <button
              type="button"
              onClick={() => setHelpModalType("memory")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How much memory do I need?</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ramOptions.map((ramGb) => {
              const isSelected = selectedVariant.specs?.ram_gb === ramGb;
              const matchingVar = product.variants.find(
                (v) =>
                  v.color_name === selectedVariant.color_name &&
                  v.specs?.cpu_family === selectedVariant.specs?.cpu_family &&
                  v.specs?.ram_gb === ramGb
              );

              const priceDelta = matchingVar
                ? calculatePriceDelta(matchingVar.price, selectedVariant.price)
                : null;

              return (
                <button
                  key={ramGb}
                  type="button"
                  onClick={() => handleRamChange(ramGb)}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-20 transition-all cursor-pointer ${
                    isSelected
                      ? "border-zinc-950 dark:border-white bg-zinc-50/80 dark:bg-zinc-800/80 ring-1 ring-zinc-950 dark:ring-white"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div className="font-bold text-sm text-zinc-900 dark:text-white">
                    {ramGb}GB Unified Memory
                  </div>
                  <div className="text-xs font-medium text-zinc-500">
                    {isSelected ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Included
                      </span>
                    ) : priceDelta ? (
                      <span>
                        {priceDelta.sign} ฿{Math.abs(priceDelta.delta) / 100}
                      </span>
                    ) : (
                      "Available with chip upgrade"
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 4: Choose Storage (SSD) */}
      {storageOptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
              4. Choose High-Speed Storage (SSD)
            </h3>
            <button
              type="button"
              onClick={() => setHelpModalType("storage")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How much storage is right for you?</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {storageOptions.map((storageGb) => {
              const isSelected = selectedVariant.specs?.storage_gb === storageGb;
              const matchingVar = product.variants.find(
                (v) =>
                  v.color_name === selectedVariant.color_name &&
                  v.specs?.cpu_family === selectedVariant.specs?.cpu_family &&
                  v.specs?.ram_gb === selectedVariant.specs?.ram_gb &&
                  v.specs?.storage_gb === storageGb
              );

              const priceDelta = matchingVar
                ? calculatePriceDelta(matchingVar.price, selectedVariant.price)
                : null;

              const label =
                storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`;

              return (
                <button
                  key={storageGb}
                  type="button"
                  onClick={() => handleStorageChange(storageGb)}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-20 transition-all cursor-pointer ${
                    isSelected
                      ? "border-zinc-950 dark:border-white bg-zinc-50/80 dark:bg-zinc-800/80 ring-1 ring-zinc-950 dark:ring-white"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div className="font-bold text-sm text-zinc-900 dark:text-white">
                    {label} SSD Storage
                  </div>
                  <div className="text-xs font-medium text-zinc-500">
                    {isSelected ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Included
                      </span>
                    ) : priceDelta ? (
                      <span>
                        {priceDelta.sign} ฿{Math.abs(priceDelta.delta) / 100}
                      </span>
                    ) : (
                      "Available with chip upgrade"
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky Bottom Order Summary Card */}
      <div className="p-6 rounded-3xl bg-zinc-900 text-white dark:bg-zinc-900 dark:border dark:border-zinc-800 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-400 font-mono">
              SKU: {selectedVariant.sku}
            </div>
            <div className="text-2xl font-black tracking-tight text-white mt-1">
              <AnimatedPrice satang={selectedVariant.price} />
            </div>
            <div className="text-xs text-emerald-400 font-medium mt-0.5">
              0% interest: {formatMonthlyInstallment(selectedVariant.price, 10)}
            </div>
          </div>

          <div className="text-right">
            {availableStock <= 3 && availableStock > 0 ? (
              <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold uppercase tracking-wider">
                Only {availableStock} left in stock!
              </span>
            ) : availableStock > 3 ? (
              <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider">
                In Stock ({availableStock} units)
              </span>
            ) : (
              <span className="inline-block px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold uppercase tracking-wider">
                Out of stock
              </span>
            )}
          </div>
        </div>

        {availableStock <= 0 ? (
          <NotifyMe variantId={selectedVariant.id} />
        ) : (
        <button
          type="button"
          disabled={availableStock <= 0 || isAdding}
          onClick={handleAddToCart}
          className={`w-full py-4 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform cursor-pointer ${
            availableStock <= 0
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : "bg-white text-zinc-950 hover:bg-zinc-100 hover:scale-[1.01] active:scale-[0.99]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>
            {isAdding
              ? "Adding..."
              : availableStock > 0
                ? "Add to Bag"
                : "Currently Out of Stock"}
          </span>
        </button>
        )}

        <div className="flex items-center justify-center gap-6 text-[11px] text-zinc-400 pt-2 border-t border-zinc-800">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>1-Year Official Warranty</span>
          </div>
          <div>•</div>
          <div>Free Express Delivery</div>
        </div>
      </div>

      {/* Help Modal */}
      <HelpModal
        isOpen={helpModalType !== null}
        onClose={() => setHelpModalType(null)}
        type={helpModalType || "memory"}
      />
    </div>
  );
}
