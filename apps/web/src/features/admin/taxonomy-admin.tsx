import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { useStorefrontStore } from "@/stores/storefront-store";
import type { AdminBrand, AdminCategory } from "@/types/api";
import { ImageField } from "./image-field";

type Kind = "category" | "brand";
type Draft = { id?: string; name: string; slug: string; nav_label: string; icon_name: string; sort_order: number; logo_url: string };

const blank = (kind: Kind, nextSort: number): Draft => ({
  name: "",
  slug: "",
  nav_label: "",
  icon_name: kind === "category" ? "Laptop" : "",
  sort_order: nextSort,
  logo_url: "",
});

const field = "w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white";
const labelCls = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1";

/** Admin › Categories & Brands. */
export function TaxonomyAdmin() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [brands, setBrands] = useState<AdminBrand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: Kind; draft: Draft } | null>(null);
  const refreshStorefront = useStorefrontStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([apiClient<AdminCategory[]>("/admin/categories"), apiClient<AdminBrand[]>("/admin/brands")]);
      setCategories(c.data || []);
      setBrands(b.data || []);
    } catch (err) {
      setError((err as Error).message || "Could not load categories and brands.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saved = () => {
    setEditing(null);
    load();
    refreshStorefront();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Categories & Brands</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Categories with a menu label appear in the top menu, in their sort order. Entries that still have products can't be deleted.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}

      <Section
        title="Categories"
        onAdd={() => setEditing({ kind: "category", draft: blank("category", (categories?.at(-1)?.sort_order ?? 0) + 1) })}
        loading={categories === null}
        empty="No categories yet."
        headers={["Name", "Menu label", "Slug", "Order", "Products"]}
        rows={(categories ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          cells: [
            <span className="font-semibold text-zinc-900 dark:text-white">{c.name}</span>,
            c.nav_label || <span className="text-zinc-400">Not in menu</span>,
            <span className="font-mono text-zinc-500">{c.slug}</span>,
            c.sort_order,
            c.product_count,
          ],
          productCount: c.product_count,
          onEdit: () => setEditing({ kind: "category", draft: { ...blank("category", 0), ...c } }),
          deletePath: `/admin/categories/${c.id}`,
        }))}
        onDeleted={saved}
      />

      <Section
        title="Brands"
        onAdd={() => setEditing({ kind: "brand", draft: blank("brand", 0) })}
        loading={brands === null}
        empty="No brands yet."
        headers={["Logo", "Name", "Slug", "Products"]}
        rows={(brands ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          cells: [
            <span className="w-8 h-8 rounded-lg bg-white border border-zinc-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden">
              {b.logo_url ? <img src={b.logo_url} alt="" className="max-w-full max-h-full object-contain p-1" /> : <ImageOff className="w-3.5 h-3.5 text-zinc-400" />}
            </span>,
            <span className="font-semibold text-zinc-900 dark:text-white">{b.name}</span>,
            <span className="font-mono text-zinc-500">{b.slug}</span>,
            b.product_count,
          ],
          productCount: b.product_count,
          onEdit: () => setEditing({ kind: "brand", draft: { ...blank("brand", 0), ...b } }),
          deletePath: `/admin/brands/${b.id}`,
        }))}
        onDeleted={saved}
      />

      {editing && <EditDialog kind={editing.kind} initial={editing.draft} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  );
}

interface Row {
  id: string;
  name: string;
  cells: React.ReactNode[];
  productCount: number;
  onEdit: () => void;
  deletePath: string;
}

function Section(props: {
  title: string;
  onAdd: () => void;
  loading: boolean;
  empty: string;
  headers: string[];
  rows: Row[];
  onDeleted: () => void;
}) {
  return (
    <section className="space-y-3" aria-label={props.title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-zinc-950 dark:text-white">{props.title}</h3>
        <button
          type="button"
          onClick={props.onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:opacity-90 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add {props.title === "Categories" ? "category" : "brand"}
        </button>
      </div>
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                {props.headers.map((h) => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {props.loading ? (
                <tr>
                  <td colSpan={props.headers.length + 1} className="px-4 py-10 text-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td>
                </tr>
              ) : props.rows.length === 0 ? (
                <tr>
                  <td colSpan={props.headers.length + 1} className="px-4 py-10 text-center text-zinc-500">
                    {props.empty}
                  </td>
                </tr>
              ) : (
                props.rows.map((row) => <TableRow key={row.id} row={row} onDeleted={props.onDeleted} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function TableRow({ row, onDeleted }: { row: Row; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient(row.deletePath, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError((err as Error).message || "Could not delete.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const btn = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-50";

  return (
    <tr className="align-middle">
      {row.cells.map((cell, i) => (
        <td key={i} className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
          {cell}
        </td>
      ))}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {confirming ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-zinc-500">Delete {row.name}?</span>
            <button type="button" disabled={busy} onClick={remove} className={`${btn} bg-rose-600 text-white hover:bg-rose-500`}>
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>
              Keep
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <button type="button" onClick={row.onEdit} className={`${btn} bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700`}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={row.productCount > 0}
              title={row.productCount > 0 ? "Move its products to another entry first" : undefined}
              aria-label={`Delete ${row.name}`}
              className={`${btn} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:cursor-not-allowed`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
        {error && <p className="mt-1 text-[11px] text-rose-600 whitespace-normal">{error}</p>}
      </td>
    </tr>
  );
}

function EditDialog({ kind, initial, onClose, onSaved }: { kind: Kind; initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !initial.id;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const base = kind === "category" ? "/admin/categories" : "/admin/brands";
    const body =
      kind === "category"
        ? { name: draft.name, slug: draft.slug, nav_label: draft.nav_label, icon_name: draft.icon_name, sort_order: Number(draft.sort_order) || 0 }
        : { name: draft.name, slug: draft.slug, logo_url: draft.logo_url };
    try {
      await apiClient(isNew ? base : `${base}/${initial.id}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setErrors(apiErr.fields ?? {});
      setMessage(apiErr.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="mt-1 text-[11px] text-rose-600">{errors[k]}</p>;
  const title = `${isNew ? "New" : "Edit"} ${kind}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-zinc-950/40" onClick={onClose} aria-hidden />
      <form
        onSubmit={submit}
        noValidate
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl p-6 space-y-4"
        data-lenis-prevent
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-zinc-950 dark:text-white capitalize">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label htmlFor="tx-name" className={labelCls}>Name</label>
          <input id="tx-name" value={draft.name} onChange={(e) => set("name", e.target.value)} className={field} autoFocus />
          {err("name")}
        </div>
        <div>
          <label htmlFor="tx-slug" className={labelCls}>
            Slug <span className="font-normal text-zinc-400">(used in links; leave empty to generate)</span>
          </label>
          <input id="tx-slug" value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={`${field} font-mono`} placeholder="gaming-laptops" />
          {err("slug")}
          {!isNew && draft.slug !== initial.slug && <p className="mt-1 text-[11px] text-amber-600">Changing the slug breaks links that use the old one.</p>}
        </div>

        {kind === "category" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tx-nav" className={labelCls}>Menu label</label>
                <input id="tx-nav" value={draft.nav_label} onChange={(e) => set("nav_label", e.target.value)} className={field} placeholder="Gaming" />
                {err("nav_label")}
              </div>
              <div>
                <label htmlFor="tx-sort" className={labelCls}>Order</label>
                <input id="tx-sort" type="number" value={draft.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={field} />
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-zinc-400">Leave the menu label empty to keep this category out of the top menu.</p>
            <div>
              <label htmlFor="tx-icon" className={labelCls}>Icon</label>
              <input id="tx-icon" value={draft.icon_name} onChange={(e) => set("icon_name", e.target.value)} className={field} placeholder="Laptop" />
              {err("icon_name")}
            </div>
          </>
        ) : (
          <ImageField id="tx-logo" label="Logo" value={draft.logo_url} onChange={(v) => set("logo_url", v)} error={errors.logo_url} />
        )}

        {message && !Object.keys(errors).length && (
          <p role="alert" className="text-xs text-rose-600">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {isNew ? `Create ${kind}` : "Save changes"}
        </button>
      </form>
    </div>,
    document.body
  );
}
