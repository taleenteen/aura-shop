import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ExternalLink, Loader2, Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import type { AdminProductSummary, Brand, Category } from "@/types/api";

/** What a banner link can point to. Stored on the banner as a plain path or URL. */
export type LinkKind = "none" | "product" | "listing" | "external" | "custom";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const LISTING_PARAMS = new Set(["category", "brand", "sort"]);

export interface LinkTargets {
  products: AdminProductSummary[];
  categories: Category[];
  brands: Brand[];
}

interface Parsed {
  kind: LinkKind;
  slug: string; // product
  category: string; // listing
  brand: string; // listing
  sort: string; // listing
}

const EMPTY: Parsed = { kind: "none", slug: "", category: "", brand: "", sort: "newest" };

/** Reads a stored link back into picker fields. Anything the picker can't rebuild exactly stays a custom path. */
export function parseLink(value: string): Parsed {
  const v = value.trim();
  if (!v) return EMPTY;
  if (/^https?:\/\//i.test(v)) return { ...EMPTY, kind: "external" };
  if (!v.startsWith("/")) return { ...EMPTY, kind: "custom" };
  const [path, query = ""] = v.split("?", 2);
  const product = /^\/products\/([a-z0-9-]+)\/?$/i.exec(path);
  if (product && !query) return { ...EMPTY, kind: "product", slug: product[1] };
  if (path === "/catalog" || path === "/catalog/") {
    const params = new URLSearchParams(query);
    if ([...params.keys()].every((k) => LISTING_PARAMS.has(k))) {
      const sort = params.get("sort") || "newest";
      if (SORTS.some((s) => s.value === sort)) {
        return { ...EMPTY, kind: "listing", category: params.get("category") || "", brand: params.get("brand") || "", sort };
      }
    }
  }
  return { ...EMPTY, kind: "custom" };
}

export function buildListingLink(category: string, brand: string, sort: string): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (brand) params.set("brand", brand);
  if (sort && sort !== "newest") params.set("sort", sort);
  const q = params.toString();
  return q ? `/catalog?${q}` : "/catalog";
}

let targetsPromise: Promise<LinkTargets> | null = null;

/** Products (including off-sale ones), categories and brands for the picker; loaded once per page visit. */
function loadTargets(): Promise<LinkTargets> {
  if (!targetsPromise) {
    targetsPromise = Promise.all([
      apiClient<AdminProductSummary[]>("/admin/products?limit=100"),
      apiClient<Category[]>("/categories"),
      apiClient<Brand[]>("/brands"),
    ])
      .then(([p, c, b]) => ({ products: p.data || [], categories: c.data || [], brands: b.data || [] }))
      .catch((err) => {
        targetsPromise = null; // let the next editor retry
        throw err;
      });
  }
  return targetsPromise;
}

export function useLinkTargets() {
  const [targets, setTargets] = useState<LinkTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadTargets()
      .then((t) => live && setTargets(t))
      .catch((err) => live && setError((err as Error).message || "Could not load products and categories."));
    return () => {
      live = false;
    };
  }, []);
  return { targets, error };
}

/** Plain-language summary of where a link goes, plus a warning when it leads nowhere useful. */
export function describeLink(value: string, targets: LinkTargets | null): { text: string; warning?: string } | null {
  const p = parseLink(value);
  switch (p.kind) {
    case "none":
      return null;
    case "product": {
      const product = targets?.products.find((x) => x.slug === p.slug);
      if (!targets) return { text: `Product page › ${p.slug}` };
      if (!product) return { text: `Product page › ${p.slug}`, warning: "No product has this address any more, so shoppers would see a “not found” page." };
      return {
        text: `Product page › ${product.name}`,
        warning: product.is_active ? undefined : "This product is off sale, so shoppers would see a “not found” page. Put it on sale or pick another product.",
      };
    }
    case "listing": {
      const cat = p.category ? targets?.categories.find((c) => c.slug === p.category) : undefined;
      const brand = p.brand ? targets?.brands.find((b) => b.slug === p.brand) : undefined;
      const parts = [p.category ? (cat?.name ?? p.category) : "All products"];
      if (p.brand) parts.push(brand?.name ?? p.brand);
      if (p.sort !== "newest") parts.push(SORTS.find((s) => s.value === p.sort)?.label ?? p.sort);
      const missing = targets && ((p.category && !cat) || (p.brand && !brand));
      return {
        text: `Product list › ${parts.join(" · ")}`,
        warning: missing ? "This category or brand no longer exists, so the list may come up empty." : undefined,
      };
    }
    case "external": {
      try {
        return { text: `Another website › ${new URL(value).host}` };
      } catch {
        return { text: "Another website" };
      }
    }
    default:
      return { text: `Custom address › ${value}` };
  }
}

const KIND_OPTIONS: { value: LinkKind; label: string }[] = [
  { value: "product", label: "A product page" },
  { value: "listing", label: "A product list (category / brand)" },
  { value: "external", label: "Another website" },
  { value: "custom", label: "Custom address (advanced)" },
];

interface LinkPickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Adds a "No link" choice. */
  optional?: boolean;
  error?: string;
  targets: LinkTargets | null;
  targetsError?: string | null;
}

const input = "w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white";
const labelCls = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1";

/** Choose where a banner button goes without knowing the site's URL structure. */
export function LinkPicker({ id, label, value, onChange, optional, error, targets, targetsError }: LinkPickerProps) {
  const parsed = parseLink(value);
  // The kind is remembered separately so an empty choice ("product, none picked yet") doesn't fall back to "no link".
  const [kind, setKind] = useState<LinkKind>(parsed.kind === "none" ? (optional ? "none" : "product") : parsed.kind);
  const emitted = useRef(value);

  // Follow changes made outside the picker (e.g. a suggested second button), not our own edits.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const next = parseLink(value).kind;
    setKind(next === "none" ? (optional ? "none" : "product") : next);
  }, [value, optional]);

  const emit = (v: string) => {
    emitted.current = v;
    onChange(v);
  };

  const chooseKind = (k: LinkKind) => {
    setKind(k);
    if (k === "none" || k === "product") emit("");
    else if (k === "listing") emit(buildListingLink("", "", "newest"));
    else if (k === "external") emit(/^https?:\/\//i.test(value) ? value : "https://");
    else emit(value); // custom: start from whatever the link is now, so it can be fine-tuned
  };

  const summary = describeLink(value, targets);
  const opensSite = summary && (kind === "external" ? /^https?:\/\/[^/]+\.[^/]+/i.test(value) : value.startsWith("/"));

  return (
    <fieldset className="space-y-2 min-w-0">
      <legend className={labelCls}>{label}</legend>
      <select id={id} aria-label={`${label}: where it goes`} value={kind} onChange={(e) => chooseKind(e.target.value as LinkKind)} className={input}>
        {optional && <option value="none">No link</option>}
        {KIND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {(kind === "product" || kind === "listing") && !targets && (
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
          {targetsError ? (
            <span className="text-rose-600">{targetsError}</span>
          ) : (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Loading products and categories…
            </>
          )}
        </p>
      )}

      {kind === "product" && targets && (
        <ProductCombobox id={`${id}-product`} label={label} products={targets.products} value={parsed.kind === "product" ? parsed.slug : ""} onChange={(slug) => emit(slug ? `/products/${slug}` : "")} />
      )}

      {kind === "listing" && targets && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select aria-label={`${label}: category`} value={parsed.category} onChange={(e) => emit(buildListingLink(e.target.value, parsed.brand, parsed.sort))} className={input}>
            <option value="">All categories</option>
            {targets.categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label={`${label}: brand`} value={parsed.brand} onChange={(e) => emit(buildListingLink(parsed.category, e.target.value, parsed.sort))} className={input}>
            <option value="">All brands</option>
            {targets.brands.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
          <select aria-label={`${label}: order`} value={parsed.sort} onChange={(e) => emit(buildListingLink(parsed.category, parsed.brand, e.target.value))} className={input}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === "external" && (
        <input aria-label={`${label}: website address`} value={value} onChange={(e) => emit(e.target.value)} placeholder="https://www.example.com/promo" className={`${input} font-mono`} aria-invalid={!!error} />
      )}

      {kind === "custom" && (
        <div className="space-y-1">
          <input aria-label={`${label}: custom address`} value={value} onChange={(e) => emit(e.target.value)} placeholder="/catalog?category=mac&min_price=3000000" className={`${input} font-mono`} aria-invalid={!!error} />
          <p className="text-[11px] text-zinc-500">A page on this site, starting with “/”. Tip: open the page in the store, copy everything after the domain and paste it here.</p>
        </div>
      )}

      {summary && (
        <div className="text-[11px] space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-600 dark:text-zinc-400">
            <span>
              Goes to: <span className="font-semibold text-zinc-900 dark:text-white">{summary.text}</span>
            </span>
            {opensSite && (
              <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-zinc-900 dark:text-white underline underline-offset-2 decoration-zinc-300 hover:decoration-zinc-900">
                Open <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </p>
          {summary.warning && (
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {summary.warning}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </fieldset>
  );
}

function ProductCombobox({ id, label, products, value, onChange }: { id: string; label: string; products: AdminProductSummary[]; value: string; onChange: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = products.find((p) => p.slug === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? products.filter((p) => `${p.name} ${p.brand_name} ${p.category_name} ${p.slug}`.toLowerCase().includes(q)) : products;
    // Products on sale first; off-sale ones stay pickable but sink to the bottom.
    return [...list].sort((a, b) => Number(b.is_active) - Number(a.is_active));
  }, [products, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (slug: string) => {
    onChange(slug);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) pick(matches[active].slug);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: product`}
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
        }}
        className={`${input} flex items-center gap-2 text-left cursor-pointer`}
      >
        {selected ? (
          <>
            {selected.thumbnail && <img src={selected.thumbnail} alt="" className="w-6 h-6 object-contain rounded" />}
            <span className="truncate font-semibold">{selected.name}</span>
            {!selected.is_active && <span className="shrink-0 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">off sale</span>}
          </>
        ) : (
          <span className="text-zinc-400">Choose a product…</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          <div className="relative border-b border-zinc-100 dark:border-zinc-800">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              role="combobox"
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={matches[active] ? `${listId}-${matches[active].id}` : undefined}
              aria-label="Search products"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder="Search by name, brand or category"
              className="w-full pl-8 pr-3 py-2 text-xs bg-transparent outline-none text-zinc-900 dark:text-white"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Products" className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 && <li className="px-3 py-3 text-xs text-zinc-500">No products match “{query}”.</li>}
            {matches.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={p.slug === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p.slug)}
                className={`px-3 py-2 flex items-center gap-2.5 text-xs cursor-pointer ${i === active ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
              >
                <span className="w-8 h-8 shrink-0 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {p.thumbnail && <img src={p.thumbnail} alt="" className="max-w-full max-h-full object-contain" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold ${p.is_active ? "text-zinc-900 dark:text-white" : "text-zinc-400"}`}>{p.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {p.category_name} · {p.brand_name} · from {formatTHB(p.min_price)}
                    {!p.is_active && <span className="ml-1 font-bold uppercase text-amber-700 dark:text-amber-400">off sale</span>}
                  </span>
                </span>
                {p.slug === value && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** For a hero whose first button opens a product: a second button to the rest of that product's category. */
export function suggestSecondButton(primary: string, targets: LinkTargets | null): { text: string; link: string } | null {
  const p = parseLink(primary);
  if (p.kind !== "product" || !targets) return null;
  const product = targets.products.find((x) => x.slug === p.slug);
  const category = product && targets.categories.find((c) => c.name === product.category_name);
  if (!category) return null;
  return { text: `Shop all ${category.nav_label || category.name}`, link: buildListingLink(category.slug, "", "newest") };
}
