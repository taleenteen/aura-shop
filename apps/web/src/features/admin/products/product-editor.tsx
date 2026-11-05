import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  PackagePlus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { apiClient, apiUpload, type ApiRequestError } from "@/lib/api-client";
import { formatTHB } from "@/lib/currency";
import { BENTO_ICON_NAMES } from "@/features/configurator/bento-highlights";
import { BOX_ICON_NAMES } from "@/features/configurator/ports-and-box";
import type {
  BentoHighlightItem,
  BoxContentItem,
  Brand,
  Category,
  FacetCounts,
  PortItem,
  Product,
  ProductInput,
  SpecCategoryGroup,
  VariantInput,
} from "@/types/api";
import { StockDialog } from "./stock-dialog";

/** A variant in the form: the input fields plus read-only stock for saved variants. */
type VariantDraft = VariantInput & { key: string; stock_quantity?: number; reserved_stock?: number };
type Draft = Omit<ProductInput, "variants"> & { variants: VariantDraft[] };

const PERSONAS = [
  { value: "CREATOR", label: "Creator" },
  { value: "GAMING", label: "Gaming" },
  { value: "ULTRALIGHT", label: "Ultralight" },
  { value: "OFFICE", label: "Office & Study" },
];
const RAM_OPTIONS = [0, 8, 16, 18, 24, 32, 36, 48, 64, 96, 128];
const STORAGE_OPTIONS = [0, 256, 512, 1024, 2048, 4096, 8192];
const storageText = (gb: number) => (gb === 0 ? "None" : gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`);

let keySeq = 0;
const newKey = () => `v${++keySeq}`;

const emptyVariant = (from?: VariantDraft): VariantDraft => ({
  key: newKey(),
  sku: "",
  color_name: "",
  color_hex: "#18181B",
  price: from?.price ?? 0,
  compare_price: 0,
  specs: from ? { ...from.specs } : { cpu_family: "", ram_gb: 0, storage_gb: 0 },
  images: [],
  initial_stock: 0,
});

const emptyDraft = (): Draft => ({
  name: "",
  slug: "",
  category_id: "",
  brand_id: "",
  tagline: "",
  short_description: "",
  usage_personas: [],
  bento_highlights: [],
  box_contents: [],
  ports_diagram: { left_ports: [], right_ports: [] },
  full_spec_matrix: [],
  is_active: false,
  variants: [emptyVariant()],
});

function fromProduct(p: Product): Draft {
  return {
    name: p.name,
    slug: p.slug,
    category_id: p.category_id,
    brand_id: p.brand_id,
    tagline: p.tagline ?? "",
    short_description: p.short_description ?? "",
    usage_personas: p.usage_personas ?? [],
    bento_highlights: p.bento_highlights ?? [],
    box_contents: p.box_contents ?? [],
    ports_diagram: p.ports_diagram ?? { left_ports: [], right_ports: [] },
    full_spec_matrix: p.full_spec_matrix ?? [],
    is_active: p.is_active,
    variants: (p.variants ?? []).map((v) => ({
      key: newKey(),
      id: v.id,
      sku: v.sku,
      color_name: v.color_name,
      color_hex: v.color_hex,
      price: v.price,
      compare_price: v.compare_price ?? 0,
      specs: { ...(v.specs ?? {}) },
      images: Array.isArray(v.images) ? v.images : [],
      initial_stock: 0,
      stock_quantity: v.stock_quantity,
      reserved_stock: v.reserved_stock,
    })),
  };
}

function toInput(d: Draft): ProductInput {
  return {
    ...d,
    variants: d.variants.map(({ key: _key, stock_quantity: _s, reserved_stock: _r, ...v }) => v),
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const inputCls =
  "w-full px-3 py-2 text-sm rounded-xl border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500";

export function ProductEditor({ productId }: { productId: string | null }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(toInput(emptyDraft())));
  const [slugTouched, setSlugTouched] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cpuFamilies, setCpuFamilies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(!!productId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [stockFor, setStockFor] = useState<VariantDraft | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient<Category[]>("/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    apiClient<Brand[]>("/brands").then((r) => setBrands(r.data || [])).catch(() => {});
    apiClient<unknown[]>("/catalog?limit=1")
      .then((r) => {
        const facets = r.meta?.facets as FacetCounts | undefined;
        setCpuFamilies((facets?.cpu_family ?? []).map((o) => o.value));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setIsLoading(true);
    apiClient<Product>(`/admin/products/${productId}`)
      .then((r) => {
        if (cancelled) return;
        const d = fromProduct(r.data);
        setDraft(d);
        setSaved(JSON.stringify(toInput(d)));
        setSlugTouched(true);
      })
      .catch((err) => !cancelled && setLoadError((err as Error).message || "Could not load the product"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const dirty = useMemo(() => JSON.stringify(toInput(draft)) !== saved, [draft, saved]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setVariant = (key: string, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));
  const err = (path: string) => errors[path];

  const back = () => {
    if (dirty && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    navigate({ to: "/admin", search: { tab: "products" } });
  };

  const save = async () => {
    setIsSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const body = JSON.stringify(toInput(draft));
      const res = productId
        ? await apiClient<Product>(`/admin/products/${productId}`, { method: "PUT", body })
        : await apiClient<Product>("/admin/products", { method: "POST", body });
      const d = fromProduct(res.data);
      setDraft(d);
      setSaved(JSON.stringify(toInput(d)));
      setSlugTouched(true);
      setBanner({ kind: "ok", text: productId ? "Changes saved." : "Product created." });
      if (!productId) navigate({ to: "/admin", search: { tab: "products", edit: res.data.id }, replace: true });
    } catch (e) {
      const apiErr = e as ApiRequestError;
      setErrors(apiErr.fields ?? {});
      setBanner({ kind: "error", text: apiErr.message || "Could not save the product." });
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="py-16 text-center space-y-3">
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        <button type="button" onClick={() => navigate({ to: "/admin", search: { tab: "products" } })} className="text-xs font-semibold underline cursor-pointer">
          Back to products
        </button>
      </div>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="space-y-6 pb-24" ref={topRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={back} aria-label="Back to products" className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-zinc-950 dark:text-white">{productId ? draft.name || "Edit product" : "New product"}</h2>
            <p className="text-xs text-zinc-500">{draft.is_active ? "On sale" : "Hidden from the store"}</p>
          </div>
        </div>
        {productId && draft.slug && (
          <Link to="/products/$slug" params={{ slug: draft.slug }} target="_blank" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:underline">
            View in store <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {confirmLeave && (
        <div role="alert" className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>You have unsaved changes. Leave without saving?</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setConfirmLeave(false)} className="px-3 py-1 rounded-lg border border-amber-300 font-semibold cursor-pointer">Keep editing</button>
            <button type="button" onClick={back} className="px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer">Discard changes</button>
          </span>
        </div>
      )}

      {banner && (
        <div role={banner.kind === "error" ? "alert" : "status"} className={`p-3 rounded-xl text-xs font-semibold ${banner.kind === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"}`}>
          {banner.text}
          {banner.kind === "error" && errorCount > 0 && ` ${errorCount} field${errorCount === 1 ? "" : "s"} below need attention.`}
        </div>
      )}

      {/* Basics */}
      <Section title="Product details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name" error={err("name")} id="f-name">
            <input
              id="f-name"
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                setDraft((d) => ({ ...d, name, slug: slugTouched ? d.slug : slugify(name) }));
              }}
              className={`${inputCls} ${err("name") ? "border-rose-400" : "border-zinc-200 dark:border-zinc-700"}`}
            />
          </Field>
          <Field label="URL" error={err("slug")} id="f-slug" hint="Shown as /products/your-url">
            <input
              id="f-slug"
              value={draft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
              className={`${inputCls} font-mono ${err("slug") ? "border-rose-400" : "border-zinc-200 dark:border-zinc-700"}`}
            />
          </Field>
          <Field label="Category" error={err("category_id")} id="f-category">
            <select id="f-category" value={draft.category_id} onChange={(e) => set("category_id", e.target.value)} className={`${inputCls} ${err("category_id") ? "border-rose-400" : "border-zinc-200 dark:border-zinc-700"}`}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Brand" error={err("brand_id")} id="f-brand">
            <select id="f-brand" value={draft.brand_id} onChange={(e) => set("brand_id", e.target.value)} className={`${inputCls} ${err("brand_id") ? "border-rose-400" : "border-zinc-200 dark:border-zinc-700"}`}>
              <option value="">Choose…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Tagline" error={err("tagline")} id="f-tagline">
            <input id="f-tagline" maxLength={200} value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
          </Field>
          <Field label="Use cases" error={err("usage_personas")} id="f-personas" hint="Drives the Shop-by-use cards and the catalog filter">
            <div id="f-personas" className="flex flex-wrap gap-2 pt-1">
              {PERSONAS.map((p) => {
                const on = draft.usage_personas.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("usage_personas", on ? draft.usage_personas.filter((x) => x !== p.value) : [...draft.usage_personas, p.value])}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${on ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950" : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label="Short description" error={err("short_description")} id="f-desc">
              <textarea id="f-desc" rows={3} maxLength={1000} value={draft.short_description} onChange={(e) => set("short_description", e.target.value)} className={`${inputCls} border-zinc-200 dark:border-zinc-700 resize-y`} />
            </Field>
          </div>
          <label className="md:col-span-2 flex items-center gap-3 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4" />
            <span>
              <strong className="text-zinc-900 dark:text-white">On sale</strong>
              <span className="text-zinc-500"> — visible in the store and searchable</span>
            </span>
          </label>
        </div>
      </Section>

      {/* Variants */}
      <Section
        title={`Variants (${draft.variants.length})`}
        description="Each variant is a colour/configuration with its own SKU, price, images and stock."
        error={err("variants")}
      >
        <div className="space-y-4">
          {draft.variants.map((v, i) => (
            <VariantCard
              key={v.key}
              index={i}
              variant={v}
              cpuFamilies={cpuFamilies}
              errors={errors}
              onChange={(patch) => setVariant(v.key, patch)}
              onRemove={draft.variants.length > 1 ? () => set("variants", draft.variants.filter((x) => x.key !== v.key)) : undefined}
              onAdjustStock={v.id ? () => setStockFor(v) : undefined}
            />
          ))}
          <button
            type="button"
            onClick={() => set("variants", [...draft.variants, emptyVariant(draft.variants[draft.variants.length - 1])])}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add variant
          </button>
        </div>
      </Section>

      {/* Product page content */}
      <Section title="Key highlights" description="The feature tiles on the product page." error={err("bento_highlights")}>
        <ListEditor<BentoHighlightItem>
          items={draft.bento_highlights}
          onChange={(items) => set("bento_highlights", items)}
          addLabel="Add highlight"
          make={() => ({ id: `h${Date.now()}`, span: "col-span-1", icon: BENTO_ICON_NAMES[0], eyebrow: "", big_metric: "", title: "", description: "" })}
          render={(item, update) => (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input aria-label="Label" placeholder="Label (e.g. ALL-DAY BATTERY)" value={item.eyebrow} onChange={(e) => update({ eyebrow: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
              <input aria-label="Big number" placeholder="Big number (e.g. 18 hrs)" value={item.big_metric} onChange={(e) => update({ big_metric: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
              <select aria-label="Icon" value={item.icon} onChange={(e) => update({ icon: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`}>
                {BENTO_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select aria-label="Width" value={item.span} onChange={(e) => update({ span: e.target.value as BentoHighlightItem["span"] })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`}>
                <option value="col-span-1">Normal tile</option>
                <option value="col-span-2">Wide tile</option>
              </select>
              <input aria-label="Headline" placeholder="Headline" value={item.title} onChange={(e) => update({ title: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700 md:col-span-2`} />
              <input aria-label="Description" placeholder="One-line description" value={item.description} onChange={(e) => update({ description: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700 md:col-span-2`} />
            </div>
          )}
        />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="What's in the box" error={err("box_contents")}>
          <ListEditor<BoxContentItem>
            items={draft.box_contents}
            onChange={(items) => set("box_contents", items)}
            addLabel="Add item"
            make={() => ({ name: "", icon: BOX_ICON_NAMES[0] })}
            render={(item, update) => (
              <div className="flex gap-2">
                <input aria-label="Item" placeholder="e.g. 70W USB-C Power Adapter" value={item.name} onChange={(e) => update({ name: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
                <select aria-label="Icon" value={item.icon} onChange={(e) => update({ icon: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700 max-w-[8rem]`}>
                  {BOX_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          />
        </Section>

        <Section title="Ports" error={err("ports_diagram")}>
          {(["left_ports", "right_ports"] as const).map((side) => (
            <div key={side} className="mb-4 last:mb-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">{side === "left_ports" ? "Left side" : "Right side"}</p>
              <ListEditor<PortItem>
                items={draft.ports_diagram[side]}
                onChange={(items) => set("ports_diagram", { ...draft.ports_diagram, [side]: items })}
                addLabel="Add port"
                make={() => ({ name: "", spec: "" })}
                render={(item, update) => (
                  <div className="flex gap-2">
                    <input aria-label="Port" placeholder="Port (e.g. HDMI 2.1)" value={item.name} onChange={(e) => update({ name: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
                    <input aria-label="Detail" placeholder="Detail" value={item.spec} onChange={(e) => update({ spec: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
                  </div>
                )}
              />
            </div>
          ))}
        </Section>
      </div>

      <Section title="Technical specifications" description="Grouped rows shown in the full spec table." error={err("full_spec_matrix")}>
        <ListEditor<SpecCategoryGroup>
          items={draft.full_spec_matrix}
          onChange={(items) => set("full_spec_matrix", items)}
          addLabel="Add spec group"
          make={() => ({ category: "", rows: [{ label: "", value: "" }] })}
          render={(group, update) => (
            <div className="space-y-2">
              <input aria-label="Group name" placeholder="Group (e.g. Display)" value={group.category} onChange={(e) => update({ category: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700 font-semibold`} />
              <ListEditor<{ label: string; value: string }>
                items={group.rows}
                onChange={(rows) => update({ rows })}
                addLabel="Add row"
                compact
                make={() => ({ label: "", value: "" })}
                render={(row, updateRow) => (
                  <div className="flex gap-2">
                    <input aria-label="Spec" placeholder="Spec" value={row.label} onChange={(e) => updateRow({ label: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700 max-w-[12rem]`} />
                    <input aria-label="Value" placeholder="Value" value={row.value} onChange={(e) => updateRow({ value: e.target.value })} className={`${inputCls} border-zinc-200 dark:border-zinc-700`} />
                  </div>
                )}
              />
            </div>
          )}
        />
      </Section>

      {/* Save bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={back} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold cursor-pointer">
              {dirty ? "Cancel" : "Back"}
            </button>
            <button type="button" onClick={save} disabled={isSaving || (!dirty && !!productId)} className="px-5 py-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold disabled:opacity-40 cursor-pointer">
              {isSaving ? "Saving…" : productId ? "Save changes" : "Create product"}
            </button>
          </div>
        </div>
      </div>

      {stockFor?.id && (
        <StockDialog
          variantId={stockFor.id}
          sku={stockFor.sku}
          stock={stockFor.stock_quantity ?? 0}
          reserved={stockFor.reserved_stock ?? 0}
          onClose={() => setStockFor(null)}
          onChanged={(stock, reserved) => {
            // Stock is saved immediately by the dialog and is not part of the form draft.
            setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.id === stockFor.id ? { ...v, stock_quantity: stock, reserved_stock: reserved } : v)) }));
          }}
        />
      )}
    </div>
  );
}

function VariantCard({
  index,
  variant: v,
  cpuFamilies,
  errors,
  onChange,
  onRemove,
  onAdjustStock,
}: {
  index: number;
  variant: VariantDraft;
  cpuFamilies: string[];
  errors: Record<string, string>;
  onChange: (patch: Partial<VariantDraft>) => void;
  onRemove?: () => void;
  onAdjustStock?: () => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const e = (f: string) => errors[`variants.${index}.${f}`];
  const border = (f: string) => (e(f) ? "border-rose-400" : "border-zinc-200 dark:border-zinc-700");
  const spec = (k: string) => (v.specs as Record<string, unknown>)[k];
  const setSpec = (k: string, value: unknown) => onChange({ specs: { ...v.specs, [k]: value } });
  const baht = (satang: number) => (satang ? String(satang / 100) : "");
  const toSatang = (s: string) => Math.round((Number(s) || 0) * 100);
  const available = (v.stock_quantity ?? 0) - (v.reserved_stock ?? 0);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const res = await apiUpload<{ url: string }>("/admin/uploads/images", file);
        added.push(res.url);
      } catch (err) {
        setUploadError(`${file.name}: ${(err as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onChange({ images: [...v.images, ...added] });
    if (fileRef.current) fileRef.current.value = "";
  };

  const moveImage = (from: number, to: number) => {
    const next = [...v.images];
    const [img] = next.splice(from, 1);
    next.splice(to, 0, img);
    onChange({ images: next });
  };

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 space-y-4" aria-label={`Variant ${index + 1}`} role="group">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border border-zinc-300" style={{ backgroundColor: v.color_hex }} aria-hidden />
          <span className="text-sm font-bold text-zinc-900 dark:text-white">
            Variant {index + 1}
            {v.color_name && <span className="font-normal text-zinc-500"> · {v.color_name}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onAdjustStock ? (
            <>
              <span className="text-xs text-zinc-500">
                Stock <strong className="text-zinc-900 dark:text-white">{v.stock_quantity}</strong>
                {(v.reserved_stock ?? 0) > 0 && ` (${v.reserved_stock} held)`} · {available} available
              </span>
              <button type="button" onClick={onAdjustStock} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold cursor-pointer">
                <PackagePlus className="w-3.5 h-3.5" /> Adjust stock
              </button>
            </>
          ) : (
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              Opening stock
              <input
                type="number"
                min={0}
                aria-label={`Opening stock for variant ${index + 1}`}
                value={v.initial_stock}
                onChange={(ev) => onChange({ initial_stock: Math.max(0, Math.floor(Number(ev.target.value) || 0)) })}
                className={`w-20 px-2 py-1 text-sm rounded-lg border ${border("initial_stock")}`}
              />
            </label>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove variant ${index + 1}`} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {e("id") && <p className="text-xs text-rose-600">{e("id")}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Colour name" error={e("color_name")} id={`v${index}-color`}>
          <input id={`v${index}-color`} value={v.color_name} onChange={(ev) => onChange({ color_name: ev.target.value })} className={`${inputCls} ${border("color_name")}`} />
        </Field>
        <Field label="Swatch" error={e("color_hex")} id={`v${index}-hex`}>
          <div className="flex gap-2">
            <input type="color" aria-label="Pick swatch colour" value={/^#[0-9a-f]{6}$/i.test(v.color_hex) ? v.color_hex : "#000000"} onChange={(ev) => onChange({ color_hex: ev.target.value.toUpperCase() })} className="h-9 w-10 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer" />
            <input id={`v${index}-hex`} value={v.color_hex} size={8} onChange={(ev) => onChange({ color_hex: ev.target.value })} className={`${inputCls} font-mono ${border("color_hex")}`} />
          </div>
        </Field>
        <Field label="SKU" error={e("sku")} id={`v${index}-sku`}>
          <input id={`v${index}-sku`} value={v.sku} onChange={(ev) => onChange({ sku: ev.target.value.toUpperCase() })} className={`${inputCls} font-mono ${border("sku")}`} />
        </Field>
        <Field label="Price (฿)" error={e("price")} id={`v${index}-price`} hint={v.price ? formatTHB(v.price) : undefined}>
          <input id={`v${index}-price`} type="number" min={0} step="1" value={baht(v.price)} onChange={(ev) => onChange({ price: toSatang(ev.target.value) })} className={`${inputCls} ${border("price")}`} />
        </Field>
        <Field label="Compare-at price (฿)" error={e("compare_price")} id={`v${index}-compare`} hint="Optional strikethrough price">
          <input id={`v${index}-compare`} type="number" min={0} step="1" value={baht(v.compare_price)} onChange={(ev) => onChange({ compare_price: toSatang(ev.target.value) })} className={`${inputCls} ${border("compare_price")}`} />
        </Field>
        <Field label="Processor family" error={e("specs")} id={`v${index}-cpu`} hint="Used by the catalog filter">
          <input id={`v${index}-cpu`} list="cpu-families" value={String(spec("cpu_family") ?? "")} onChange={(ev) => setSpec("cpu_family", ev.target.value)} className={`${inputCls} ${border("specs")}`} />
        </Field>
        <Field label="Memory" id={`v${index}-ram`}>
          <select id={`v${index}-ram`} value={Number(spec("ram_gb") ?? 0)} onChange={(ev) => setSpec("ram_gb", Number(ev.target.value))} className={`${inputCls} border-zinc-200 dark:border-zinc-700`}>
            {RAM_OPTIONS.map((n) => <option key={n} value={n}>{n === 0 ? "None (not a computer)" : `${n}GB`}</option>)}
          </select>
        </Field>
        <Field label="Storage" id={`v${index}-storage`}>
          <select id={`v${index}-storage`} value={Number(spec("storage_gb") ?? 0)} onChange={(ev) => setSpec("storage_gb", Number(ev.target.value))} className={`${inputCls} border-zinc-200 dark:border-zinc-700`}>
            {STORAGE_OPTIONS.map((n) => <option key={n} value={n}>{storageText(n)}</option>)}
          </select>
        </Field>
      </div>
      <datalist id="cpu-families">
        {cpuFamilies.map((c) => <option key={c} value={c} />)}
      </datalist>

      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-zinc-600 dark:text-zinc-300">More specs</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          {[
            ["cpu_detail", "Processor detail", "text"],
            ["screen_size_inch", "Screen size (inch)", "number"],
            ["panel_type", "Panel", "text"],
            ["refresh_rate_hz", "Refresh rate (Hz)", "number"],
            ["weight_kg", "Weight (kg)", "number"],
          ].map(([k, label, type]) => (
            <Field key={k} label={label} id={`v${index}-${k}`}>
              <input
                id={`v${index}-${k}`}
                type={type}
                step="any"
                value={spec(k) === undefined || spec(k) === null ? "" : String(spec(k))}
                onChange={(ev) => setSpec(k, type === "number" ? (ev.target.value === "" ? undefined : Number(ev.target.value)) : ev.target.value)}
                className={`${inputCls} border-zinc-200 dark:border-zinc-700`}
              />
            </Field>
          ))}
          <label className="flex items-center gap-2 pt-6 cursor-pointer">
            <input type="checkbox" checked={!!spec("has_thunderbolt")} onChange={(ev) => setSpec("has_thunderbolt", ev.target.checked)} />
            Thunderbolt
          </label>
        </div>
      </details>

      <div>
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Images <span className="font-normal text-zinc-400">— first image is the cover</span></p>
        <div className="flex flex-wrap gap-2">
          {v.images.map((url, i) => (
            <div key={url + i} className="relative w-24 h-24 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden group">
              <img src={url} alt={`Variant ${index + 1} image ${i + 1}`} className="max-w-full max-h-full object-contain" />
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-white/90 dark:bg-zinc-900/90 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" aria-label="Move image earlier" disabled={i === 0} onClick={() => moveImage(i, i - 1)} className="p-0.5 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-3.5 h-3.5 -rotate-90" /></button>
                <button type="button" aria-label="Remove image" onClick={() => onChange({ images: v.images.filter((_, j) => j !== i) })} className="p-0.5 text-rose-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Move image later" disabled={i === v.images.length - 1} onClick={() => moveImage(i, i + 1)} className="p-0.5 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-3.5 h-3.5 -rotate-90" /></button>
              </div>
            </div>
          ))}
          <label className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center gap-1 text-[11px] text-zinc-500 cursor-pointer hover:border-zinc-400">
            {uploading > 0 ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
            {uploading > 0 ? "Uploading…" : "Add images"}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label={`Upload images for variant ${index + 1}`} onChange={(ev) => upload(ev.target.files)} />
          </label>
        </div>
        {(uploadError || e("images")) && <p className="mt-1 text-xs text-rose-600">{uploadError || e("images")}</p>}
      </div>
    </div>
  );
}

function Section({ title, description, error, children }: { title: string; description?: string; error?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-zinc-950 dark:text-white">{title}</h3>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, hint, id, children }: { label: string; error?: string; hint?: string; id: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-[11px] text-rose-600">{error}</p> : hint ? <p className="mt-1 text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function ListEditor<T>({
  items,
  onChange,
  make,
  render,
  addLabel,
  compact,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  render: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel: string;
  compact?: boolean;
}) {
  const move = (from: number, to: number) => {
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className={`flex gap-2 items-start ${compact ? "" : "p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40"}`}>
          <div className="flex-1 min-w-0">{render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
          <div className="flex flex-col gap-0.5">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1 text-zinc-400 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} className="p-1 text-zinc-400 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-3.5 h-3.5" /></button>
          </div>
          <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, make()])} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:underline cursor-pointer">
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}
