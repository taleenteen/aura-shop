import { useState, useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { SlidersHorizontal, RotateCcw, Loader2, X } from "lucide-react";
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

interface FilterSidebarContentProps {
  facets: FacetCounts | null;
  persona: string;
  setPersona: (p: string) => void;
  brand: string;
  setBrand: (b: string) => void;
  cpu: string;
  setCpu: (c: string) => void;
  ram: number;
  setRam: (r: number) => void;
  storage: number;
  setStorage: (s: number) => void;
  minPrice: number;
  setMinPrice: (p: number) => void;
  maxPrice: number;
  setMaxPrice: (p: number) => void;
  resetFilters: () => void;
}

function FilterSidebarContent({
  facets,
  persona,
  setPersona,
  brand,
  setBrand,
  cpu,
  setCpu,
  ram,
  setRam,
  storage,
  setStorage,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  resetFilters,
}: FilterSidebarContentProps) {
  return (
    <div className="space-y-6">
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
  );
}

type CatalogSearch = Record<string, unknown>;

const asText = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const asNumber = (v: unknown) => Number(v) || 0;

/** Filters as they appear in the URL. The URL is the source of truth for the catalog. */
function filtersFromSearch(search: CatalogSearch) {
  return {
    category: asText(search.category),
    brand: asText(search.brand),
    persona: asText(search.persona),
    cpu: asText(search.cpu),
    ram: asNumber(search.ram),
    storage: asNumber(search.storage),
    minPrice: asNumber(search.min_price),
    maxPrice: asNumber(search.max_price),
    sort: asText(search.sort) || "newest",
    page: Math.max(1, asNumber(search.page)),
  };
}

export function CatalogPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search as CatalogSearch });
  const initial = filtersFromSearch(search);
  const latestRequest = useRef(0);

  const [products, setProducts] = useState<Product[]>([]);
  const [facets, setFacets] = useState<FacetCounts | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Filters state
  // Initialised from the URL so the first request is already filtered.
  const [category, setCategory] = useState<string>(initial.category);
  const [brand, setBrand] = useState<string>(initial.brand);
  const [persona, setPersona] = useState<string>(initial.persona);
  const [cpu, setCpu] = useState<string>(initial.cpu);
  const [ram, setRam] = useState<number>(initial.ram);
  const [storage, setStorage] = useState<number>(initial.storage);
  const [minPrice, setMinPrice] = useState<number>(initial.minPrice); // Satang
  const [maxPrice, setMaxPrice] = useState<number>(initial.maxPrice); // Satang
  const [sort, setSort] = useState<string>(initial.sort);
  const [page, setPage] = useState<number>(initial.page);

  // Count active filters for badge
  const activeFiltersCount =
    (category ? 1 : 0) +
    (brand ? 1 : 0) +
    (persona ? 1 : 0) +
    (cpu ? 1 : 0) +
    (ram > 0 ? 1 : 0) +
    (storage > 0 ? 1 : 0) +
    (minPrice > 0 || maxPrice > 0 ? 1 : 0);

  // Follow the URL: navbar links, footer links, back/forward and pasted links all change
  // it while this page stays mounted, so re-read the filters on every change.
  useEffect(() => {
    const f = filtersFromSearch(search);
    setCategory(f.category);
    setBrand(f.brand);
    setPersona(f.persona);
    setCpu(f.cpu);
    setRam(f.ram);
    setStorage(f.storage);
    setMinPrice(f.minPrice);
    setMaxPrice(f.maxPrice);
    setSort(f.sort);
    setPage(f.page);
  }, [search]);

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

    // Mirror filter changes made on this page into the URL through the router, so the router,
    // the address bar and the back button agree. Skipped when the URL already matches.
    const next: CatalogSearch = {};
    if (category) next.category = category;
    if (brand) next.brand = brand;
    if (persona) next.persona = persona;
    if (cpu) next.cpu = cpu;
    if (ram > 0) next.ram = ram;
    if (storage > 0) next.storage = storage;
    if (minPrice > 0) next.min_price = minPrice;
    if (maxPrice > 0) next.max_price = maxPrice;
    if (sort !== "newest") next.sort = sort;
    if (page > 1) next.page = page;
    const current = filtersFromSearch(search);
    const wanted = filtersFromSearch(next);
    if (JSON.stringify(current) !== JSON.stringify(wanted)) {
      navigate({ to: "/catalog", search: next, replace: true });
    }

    // Ignore responses that arrive after a newer request was sent.
    const requestId = ++latestRequest.current;
    apiClient<Product[]>(`/catalog?${q.toString()}`)
      .then((res) => {
        if (requestId !== latestRequest.current) return;
        setProducts(res.data || []);
        if (res.meta?.facets) {
          setFacets(res.meta.facets);
        }
        setTotalItems(res.meta?.total_items || 0);
      })
      .catch(() => {
        if (requestId === latestRequest.current) setProducts([]);
      })
      .finally(() => {
        if (requestId === latestRequest.current) setIsLoading(false);
      });
    // `search` is read only to skip redundant navigation; filters drive the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        {/* Sort, Reset & Mobile Filter Trigger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Filter Sheet Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileFilterOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 cursor-pointer transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

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
        {/* Left Column: Faceted Filter Sidebar (Desktop) */}
        <aside className="hidden lg:block lg:col-span-1 space-y-6">
          <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
            <FilterSidebarContent
              facets={facets}
              persona={persona}
              setPersona={setPersona}
              brand={brand}
              setBrand={setBrand}
              cpu={cpu}
              setCpu={setCpu}
              ram={ram}
              setRam={setRam}
              storage={storage}
              setStorage={setStorage}
              minPrice={minPrice}
              setMinPrice={setMinPrice}
              maxPrice={maxPrice}
              setMaxPrice={setMaxPrice}
              resetFilters={resetFilters}
            />
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

      {/* Mobile Filter Slide-over Sheet with Sticky Bottom Apply Bar */}
      <AnimatePresence>
        {isMobileFilterOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileFilterOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Slide-over Content from Right */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-950 shadow-2xl flex flex-col justify-between z-50"
            >
              {/* Sheet Header */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-zinc-900 dark:text-white" />
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                    Filter Hardware Inventory
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Filters Content */}
              <div className="flex-1 overflow-y-auto p-5">
                <FilterSidebarContent
                  facets={facets}
                  persona={persona}
                  setPersona={setPersona}
                  brand={brand}
                  setBrand={setBrand}
                  cpu={cpu}
                  setCpu={setCpu}
                  ram={ram}
                  setRam={setRam}
                  storage={storage}
                  setStorage={setStorage}
                  minPrice={minPrice}
                  setMinPrice={setMinPrice}
                  maxPrice={maxPrice}
                  setMaxPrice={setMaxPrice}
                  resetFilters={resetFilters}
                />
              </div>

              {/* Sticky Bottom Apply Filters Bar */}
              <div className="sticky bottom-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shadow-lg">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Apply Filters ({totalItems} results)</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
