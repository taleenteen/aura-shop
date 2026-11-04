import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { SlidersHorizontal, RotateCcw, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { Product, FacetCounts } from "@/types/api";
import { ProductCard } from "@/features/catalog/product-card";
import { satangToBaht, bahtToSatang } from "@/lib/currency";

const PRICE_CHIPS = [
  { label: "All Prices", min: 0, max: 0 },
  { label: "Under ฿15,000", min: 0, max: 1500000 },
  { label: "฿15,000 – ฿35,000", min: 1500000, max: 3500000 },
  { label: "฿35,000 – ฿65,000", min: 3500000, max: 6500000 },
  { label: "Above ฿65,000", min: 6500000, max: 0 },
];

export function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [facets, setFacets] = useState<FacetCounts | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [category, setCategory] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [persona, setPersona] = useState<string>("");
  const [cpu, setCpu] = useState<string>("");
  const [ram, setRam] = useState<number>(0);
  const [storage, setStorage] = useState<number>(0);
  const [minPrice, setMinPrice] = useState<number>(0); // Satang
  const [maxPrice, setMaxPrice] = useState<number>(0); // Satang
  const [sort, setSort] = useState<string>("newest");
  const [page, setPage] = useState<number>(1);

  // Read URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("category")) setCategory(params.get("category") || "");
    if (params.get("brand")) setBrand(params.get("brand") || "");
    if (params.get("persona")) setPersona(params.get("persona") || "");
    if (params.get("cpu")) setCpu(params.get("cpu") || "");
    if (params.get("ram")) setRam(Number(params.get("ram")) || 0);
    if (params.get("storage")) setStorage(Number(params.get("storage")) || 0);
    if (params.get("min_price")) setMinPrice(Number(params.get("min_price")) || 0);
    if (params.get("max_price")) setMaxPrice(Number(params.get("max_price")) || 0);
    if (params.get("sort")) setSort(params.get("sort") || "newest");
  }, []);

  // Fetch catalog whenever filters change
  useEffect(() => {
    setIsLoading(true);
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (brand) q.set("brand", brand);
    if (persona) q.set("persona", persona);
    if (cpu) q.set("cpu", cpu);
    if (ram > 0) q.set("ram", ram.toString());
    if (storage > 0) q.set("storage", storage.toString());
    if (minPrice > 0) q.set("min_price", minPrice.toString());
    if (maxPrice > 0) q.set("max_price", maxPrice.toString());
    if (sort) q.set("sort", sort);
    q.set("page", page.toString());
    q.set("limit", "12");

    // Sync to browser history
    const newRelativePathQuery =
      window.location.pathname + "?" + q.toString();
    window.history.replaceState(null, "", newRelativePathQuery);

    apiClient<Product[]>(`/catalog?${q.toString()}`)
      .then((res) => {
        setProducts(res.data || []);
        if (res.meta?.facets) {
          setFacets(res.meta.facets);
        }
        setTotalItems(res.meta?.total_items || 0);
      })
      .catch(() => {
        setProducts([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [category, brand, persona, cpu, ram, storage, minPrice, maxPrice, sort, page]);

  const resetFilters = () => {
    setCategory("");
    setBrand("");
    setPersona("");
    setCpu("");
    setRam(0);
    setStorage(0);
    setMinPrice(0);
    setMaxPrice(0);
    setSort("newest");
    setPage(1);
  };

  const isPriceChipActive = (chipMin: number, chipMax: number) => {
    return minPrice === chipMin && maxPrice === chipMax;
  };

  const handlePriceChipClick = (chipMin: number, chipMax: number) => {
    if (isPriceChipActive(chipMin, chipMax)) {
      setMinPrice(0);
      setMaxPrice(0);
    } else {
      setMinPrice(chipMin);
      setMaxPrice(chipMax);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
            Flagship Hardware Catalog
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Showing {totalItems} verified workstations, ultrabooks, and accessories
          </p>
        </div>

        {/* Sort & Reset */}
        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer"
          >
            <option value="newest">Sort by: Newest Releases</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
            title="Reset Filters"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Price Bracket Chips */}
      <div className="py-4 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs font-bold text-zinc-400 shrink-0 uppercase tracking-wider pr-1">
          Price Brackets:
        </span>
        {PRICE_CHIPS.map((chip) => {
          const active = isPriceChipActive(chip.min, chip.max);
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => handlePriceChipClick(chip.min, chip.max)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer ${
                active
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold shadow-xs"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Main Catalog Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-6">
        {/* Left Column: Faceted Filter Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters & Facets</span>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                Clear all
              </button>
            </div>

            {/* Custom Min / Max Price Inputs */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
                Custom Price (THB)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min ฿"
                  value={minPrice ? satangToBaht(minPrice) : ""}
                  onChange={(e) =>
                    setMinPrice(bahtToSatang(Number(e.target.value)))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
                <input
                  type="number"
                  placeholder="Max ฿"
                  value={maxPrice ? satangToBaht(maxPrice) : ""}
                  onChange={(e) =>
                    setMaxPrice(bahtToSatang(Number(e.target.value)))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            {/* Usage Persona Facets */}
            {facets?.personas && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
                  Usage Persona
                </h4>
                <div className="space-y-1.5">
                  {facets.personas.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between text-xs cursor-pointer select-none py-0.5 ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed pointer-events-none"
                          : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={opt.disabled}
                          checked={persona === opt.value}
                          onChange={() =>
                            setPersona(persona === opt.value ? "" : opt.value)
                          }
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950 cursor-pointer"
                        />
                        <span>{opt.label}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        ({opt.count})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Brand Facets */}
            {facets?.brands && (
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
                  Hardware Brand
                </h4>
                <div className="space-y-1.5">
                  {facets.brands.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between text-xs cursor-pointer select-none py-0.5 ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed pointer-events-none"
                          : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={opt.disabled}
                          checked={brand === opt.value}
                          onChange={() =>
                            setBrand(brand === opt.value ? "" : opt.value)
                          }
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950 cursor-pointer"
                        />
                        <span>{opt.label}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        ({opt.count})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Processor Family Facets */}
            {facets?.cpu_family && (
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
                  Processor Family
                </h4>
                <div className="space-y-1.5">
                  {facets.cpu_family.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between text-xs cursor-pointer select-none py-0.5 ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed pointer-events-none"
                          : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={opt.disabled}
                          checked={cpu === opt.value}
                          onChange={() =>
                            setCpu(cpu === opt.value ? "" : opt.value)
                          }
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950 cursor-pointer"
                        />
                        <span>{opt.label}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        ({opt.count})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* RAM Facets */}
            {facets?.ram && (
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
                  Unified Memory (RAM)
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {facets.ram.map((opt) => {
                    const valNum = Number(opt.value);
                    const isSelected = ram === valNum;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        disabled={opt.disabled}
                        onClick={() => setRam(isSelected ? 0 : valNum)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                          opt.disabled
                            ? "opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400"
                            : isSelected
                              ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-transparent font-bold"
                              : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400"
                        }`}
                      >
                        {opt.label} ({opt.count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Storage Facets */}
            {facets?.storage && (
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
                  Storage (SSD)
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {facets.storage.map((opt) => {
                    const valNum = Number(opt.value);
                    const isSelected = storage === valNum;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        disabled={opt.disabled}
                        onClick={() => setStorage(isSelected ? 0 : valNum)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                          opt.disabled
                            ? "opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400"
                            : isSelected
                              ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-transparent font-bold"
                              : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400"
                        }`}
                      >
                        {opt.label} ({opt.count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Column: Animated Product Cards Grid */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Filtering inventory...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="py-24 text-center rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-8">
              <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                No configurations match your selected filters
              </h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Try widening your price range or unchecking specific RAM/CPU facets.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold text-xs cursor-pointer hover:opacity-90 transition-opacity"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
            >
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
