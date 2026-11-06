import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { useStorefrontStore } from "@/stores/storefront-store";
import type { Banner, BannerPlacement, BannerThemeMode } from "@/types/api";
import { HeroSplitBanner } from "@/features/banner/hero-split-banner";
import { BentoPromoGrid } from "@/features/banner/bento-promo-grid";
import { TopRibbon } from "@/components/layout/top-ribbon";
import { ImageField } from "./image-field";
import { LinkPicker, describeLink, suggestSecondButton, useLinkTargets } from "./link-picker";
import { z } from "zod";
import { validate, optionalText, link, type FieldErrors } from "@/lib/validation";

const PLACEMENTS: { id: BannerPlacement; label: string; note: string }[] = [
  { id: "HERO_SPLIT", label: "Home hero", note: "The live hero with the lowest order is shown at the top of the home page." },
  { id: "BENTO_GRID", label: "Promo grid", note: "Live tiles fill the promo grid below the flagship models, in order." },
  { id: "TOP_RIBBON", label: "Top ribbon", note: "The live ribbon with the lowest order runs above the menu on every page." },
];

const TILE_SIZES = [
  { value: "col-span-1 md:col-span-1 md:row-span-1", label: "Standard" },
  { value: "col-span-1 md:col-span-2 md:row-span-1", label: "Wide" },
  { value: "col-span-1 md:col-span-2 md:row-span-2", label: "Large" },
];


/** Field rules, matching the API's banner validation. */
const bannerSchema = z
  .object({
    placement: z.enum(["HERO_SPLIT", "BENTO_GRID", "TOP_RIBBON"], { message: "Choose where the banner appears." }),
    grid_span: z.string(),
    headline: z.string().trim().min(1, "Enter a headline.").max(140, "Keep the headline under 140 characters."),
    badge_text: optionalText(40, "Keep the badge under 40 characters."),
    subheadline: optionalText(300, "Keep the subheadline under 300 characters."),
    background_color: z
      .string()
      .trim()
      .max(200, "Use a colour such as #09090B or a CSS gradient.")
      .refine((v) => !/[;{}<>]/.test(v), "Use a colour such as #09090B or a CSS gradient."),
    product_image_url: z.string().trim(),
    cta_primary_text: optionalText(40, "Keep the button text under 40 characters."),
    cta_primary_link: z.string().trim(),
    cta_secondary_text: z.string().trim(),
    cta_secondary_link: z.string().trim(),
    start_at: z.string().min(1, "Choose when the banner starts."),
    end_at: z.string().min(1, "Choose when the banner ends."),
  })
  .superRefine((b, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const checkLink = (path: string, value: string) => {
      if (value && !link().safeParse(value).success) issue(path, "Use a site path like /catalog or an https:// link.");
    };
    if (b.placement !== "TOP_RIBBON") {
      if (!b.product_image_url) issue("product_image_url", "Upload or link a product image.");
      else checkLink("product_image_url", b.product_image_url);
      if (!b.cta_primary_link) issue("cta_primary_link", "Choose where the button goes.");
    }
    checkLink("cta_primary_link", b.cta_primary_link);
    checkLink("cta_secondary_link", b.cta_secondary_link);
    if (b.cta_secondary_text && !b.cta_secondary_link) issue("cta_secondary_link", "Choose where the second button goes.");
    if (b.cta_secondary_link && !b.cta_secondary_text) issue("cta_secondary_text", "Add text for the second button, or set its link to “No link”.");
    if (b.placement === "BENTO_GRID" && !TILE_SIZES.some((s) => s.value === b.grid_span)) issue("grid_span", "Choose a tile size.");
    if (new Date(b.end_at) <= new Date(b.start_at)) issue("end_at", "The end must be after the start.");
  });
type Status = "live" | "scheduled" | "ended" | "hidden";
const STATUS_STYLE: Record<Status, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  ended: "bg-zinc-500/10 text-zinc-500",
  hidden: "bg-zinc-500/10 text-zinc-500",
};

function bannerStatus(b: Banner, now = new Date()): Status {
  if (!b.is_active) return "hidden";
  if (new Date(b.start_at) > now) return "scheduled";
  if (new Date(b.end_at) < now) return "ended";
  return "live";
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** `<input type="datetime-local">` value for an ISO date, in the browser's time zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

type Draft = Omit<Banner, "id" | "created_at"> & { id?: string };

function newDraft(placement: BannerPlacement, sortOrder: number): Draft {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 86400000);
  return {
    placement,
    grid_span: placement === "BENTO_GRID" ? TILE_SIZES[0].value : "col-span-1",
    theme_mode: "DARK",
    background_color: "#09090B",
    badge_text: "",
    headline: "",
    subheadline: "",
    product_image_url: "",
    cta_primary_text: "Shop Now",
    cta_primary_link: "",
    cta_secondary_text: "",
    cta_secondary_link: "",
    sort_order: sortOrder,
    is_active: true,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

/** Admin › Banners: every banner by placement, with its schedule; create, edit, hide, delete. */
export function BannerManager() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const refreshStorefront = useStorefrontStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      const res = await apiClient<Banner[]>("/admin/banners");
      setBanners(res.data || []);
    } catch (err) {
      setError((err as Error).message || "Could not load banners.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = () => {
    load();
    refreshStorefront();
  };

  if (editing) {
    return (
      <BannerEditor
        initial={editing}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          changed();
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Banners</h2>
        <p className="text-xs text-zinc-500 mt-1">Schedule home-page campaigns. A banner shows only while it is on and between its start and end.</p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}

      {PLACEMENTS.map((p) => {
        const list = (banners ?? []).filter((b) => b.placement === p.id);
        return (
          <section key={p.id} aria-label={p.label} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-950 dark:text-white">{p.label}</h3>
                <p className="text-[11px] text-zinc-500">{p.note}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(newDraft(p.id, (list.at(-1)?.sort_order ?? 0) + 1))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:opacity-90 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New {p.label.toLowerCase()}
              </button>
            </div>
            {banners === null ? (
              <div className="py-8 flex justify-center text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : list.length === 0 ? (
              <p className="px-4 py-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-center">
                No {p.label.toLowerCase()} banners. The home page shows its built-in default.
              </p>
            ) : (
              <ul className="space-y-2">
                {list.map((b) => (
                  <BannerRow key={b.id} banner={b} onEdit={() => setEditing({ ...b })} onChanged={changed} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BannerRow({ banner, onEdit, onChanged }: { banner: Banner; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = bannerStatus(banner);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError((err as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const btn = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50";

  return (
    <li className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div
        className="w-full sm:w-28 h-16 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700"
        style={{ background: banner.background_color }}
      >
        {banner.product_image_url ? (
          <img src={banner.product_image_url} alt="" className="max-h-full max-w-full object-contain p-1" />
        ) : (
          <span className={`text-[10px] font-bold px-2 truncate ${banner.theme_mode === "LIGHT" ? "text-zinc-900" : "text-white"}`}>{banner.headline}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{banner.headline}</p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[status]}`}>{status}</span>
        </div>
        <p className="text-[11px] text-zinc-500">
          {fmtDate(banner.start_at)} → {fmtDate(banner.end_at)} • order {banner.sort_order}
        </p>
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={banner.is_active}
          aria-label={`${banner.is_active ? "Turn off" : "Turn on"}: ${banner.headline}`}
          disabled={busy}
          onClick={() => run(() => apiClient(`/admin/banners/${banner.id}/status`, { method: "PATCH", body: JSON.stringify({ is_active: !banner.is_active }) }))}
          className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${banner.is_active ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${banner.is_active ? "left-[18px]" : "left-0.5"}`} />
        </button>
        <button type="button" onClick={onEdit} className={`${btn} bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700`}>
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => apiClient(`/admin/banners/${banner.id}`, { method: "DELETE" }))}
              className={`${btn} bg-rose-600 text-white hover:bg-rose-500`}
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${banner.headline}`} className={`${btn} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function BannerEditor({ initial, onBack, onSaved }: { initial: Draft; onBack: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !initial.id;
  const ribbon = d.placement === "TOP_RIBBON";
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const { targets, error: targetsError } = useLinkTargets();
  const suggestion = d.placement === "HERO_SPLIT" && !d.cta_secondary_text && !d.cta_secondary_link ? suggestSecondButton(d.cta_primary_link, targets) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const checked = validate(bannerSchema, d);
    setErrors(checked.ok ? {} : checked.fields);
    if (!checked.ok) return;
    setBusy(true);
    try {
      const { id, ...body } = d;
      await apiClient(isNew ? "/admin/banners" : `/admin/banners/${id}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setErrors(apiErr.fields ?? {});
      setMessage(apiErr.message || "Could not save the banner.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white";
  const label = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1";
  const err = (k: string) => errors[k] && <p className="mt-1 text-[11px] text-rose-600">{errors[k]}</p>;
  const text = (k: keyof Draft, l: string, opts: { placeholder?: string; mono?: boolean } = {}) => (
    <div>
      <label htmlFor={`bn-${k}`} className={label}>{l}</label>
      <input id={`bn-${k}`} value={String(d[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} placeholder={opts.placeholder} className={`${input} ${opts.mono ? "font-mono" : ""}`} aria-invalid={!!errors[k]} />
      {err(k)}
    </div>
  );
  const preview = { ...d, id: d.id ?? "preview", created_at: "" } as Banner;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to banners" className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">{isNew ? "New banner" : "Edit banner"}</h2>
          <p className="text-xs text-zinc-500">{PLACEMENTS.find((p) => p.id === d.placement)?.note}</p>
        </div>
      </div>

      <form onSubmit={save} noValidate className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="bn-placement" className={label}>Placement</label>
            <select id="bn-placement" value={d.placement} onChange={(e) => set("placement", e.target.value as BannerPlacement)} className={input}>
              {PLACEMENTS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bn-theme" className={label}>Text colour</label>
            <select id="bn-theme" value={d.theme_mode} onChange={(e) => set("theme_mode", e.target.value as BannerThemeMode)} className={input}>
              <option value="DARK">Light text (dark background)</option>
              <option value="LIGHT">Dark text (light background)</option>
            </select>
          </div>
          {d.placement === "BENTO_GRID" ? (
            <div>
              <label htmlFor="bn-size" className={label}>Tile size</label>
              <select id="bn-size" value={d.grid_span} onChange={(e) => set("grid_span", e.target.value)} className={input}>
                {TILE_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {err("grid_span")}
            </div>
          ) : (
            <div />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">{text("headline", ribbon ? "Announcement" : "Headline", { placeholder: ribbon ? "Free 3-hour delivery in Bangkok" : "MacBook Pro with M4 Pro" })}</div>
          {!ribbon && text("badge_text", "Badge", { placeholder: "NEW" })}
        </div>
        {!ribbon && (
          <div>
            <label htmlFor="bn-subheadline" className={label}>Subheadline</label>
            <textarea id="bn-subheadline" rows={2} value={d.subheadline} onChange={(e) => set("subheadline", e.target.value)} className={input} />
            {err("subheadline")}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!ribbon && <ImageField id="bn-image" label="Product image" value={d.product_image_url} onChange={(v) => set("product_image_url", v)} error={errors.product_image_url} hint="Transparent PNG or WebP works best." />}
          <div>
            <label htmlFor="bn-bg" className={label}>Background</label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick background colour"
                value={/^#[0-9a-f]{6}$/i.test(d.background_color) ? d.background_color : "#09090b"}
                onChange={(e) => set("background_color", e.target.value)}
                className="w-10 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer"
              />
              <input id="bn-bg" value={d.background_color} onChange={(e) => set("background_color", e.target.value)} className={`${input} font-mono`} placeholder="#09090B or linear-gradient(…)" />
            </div>
            {err("background_color")}
          </div>
        </div>

        {ribbon && (
          <LinkPicker id="bn-cta_primary_link" label="When clicked, the ribbon opens" optional value={d.cta_primary_link} onChange={(v) => set("cta_primary_link", v)} error={errors.cta_primary_link} targets={targets} targetsError={targetsError} />
        )}
        {!ribbon && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              {text("cta_primary_text", "Button text")}
              <div className="sm:col-span-2">
                <LinkPicker id="bn-cta_primary_link" label="The button opens" value={d.cta_primary_link} onChange={(v) => set("cta_primary_link", v)} error={errors.cta_primary_link} targets={targets} targetsError={targetsError} />
              </div>
            </div>
            {d.placement === "HERO_SPLIT" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                {text("cta_secondary_text", "Second button text (optional)")}
                <div className="sm:col-span-2 space-y-2">
                  <LinkPicker id="bn-cta_secondary_link" label="The second button opens" optional value={d.cta_secondary_link} onChange={(v) => set("cta_secondary_link", v)} error={errors.cta_secondary_link} targets={targets} targetsError={targetsError} />
                  {suggestion && (
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-dashed border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span>
                        Suggested: <span className="font-semibold text-zinc-900 dark:text-white">“{suggestion.text}”</span> → {describeLink(suggestion.link, targets)?.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => setD((x) => ({ ...x, cta_secondary_text: suggestion.text, cta_secondary_link: suggestion.link }))}
                        className="ml-auto px-2.5 py-1 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold cursor-pointer hover:opacity-90"
                      >
                        Add this button
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bn-start" className={label}>Starts</label>
              <input id="bn-start" type="datetime-local" value={toLocalInput(d.start_at)} onChange={(e) => e.target.value && set("start_at", new Date(e.target.value).toISOString())} className={input} />
              {err("start_at")}
            </div>
            <div>
              <label htmlFor="bn-end" className={label}>Ends</label>
              <input id="bn-end" type="datetime-local" value={toLocalInput(d.end_at)} onChange={(e) => e.target.value && set("end_at", new Date(e.target.value).toISOString())} className={input} />
              {err("end_at")}
            </div>
          </div>
          <div>
            <label htmlFor="bn-order" className={label}>Order</label>
            <input id="bn-order" type="number" value={d.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={input} />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 sm:pt-6 cursor-pointer">
            <input type="checkbox" checked={d.is_active} onChange={(e) => set("is_active", e.target.checked)} className="accent-emerald-600" />
            On
          </label>
        </div>

        {message && (
          <p role="alert" className="text-xs text-rose-600">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold disabled:opacity-50 cursor-pointer">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? "Create banner" : "Save changes"}
          </button>
          <button type="button" onClick={onBack} className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold cursor-pointer">
            Cancel
          </button>
        </div>
      </form>

      <section aria-label="Preview" className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Preview</h3>
        {/* inert: the preview's links and buttons must not navigate away from the editor */}
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden pointer-events-none select-none" inert>
          {d.placement === "HERO_SPLIT" ? (
            <HeroSplitBanner banner={preview} />
          ) : d.placement === "BENTO_GRID" ? (
            <BentoPromoGrid banners={[preview]} />
          ) : (
            <TopRibbon banner={preview} />
          )}
        </div>
      </section>
    </div>
  );
}
