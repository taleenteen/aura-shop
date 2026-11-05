import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { apiClient, apiDownload, saveFile, type ApiRequestError } from "@/lib/api-client";
import type { Brand, Category, ImportColumn, ImportDecision, ImportPreview, ImportProduct, ImportResult, ImportStatus } from "@/types/api";

// ---------------------------------------------------------------- CSV helpers

const BOM = "\uFEFF"; // lets Excel open Thai text correctly

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCSV = (rows: string[][]) => BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const download = (rows: string[][], filename: string) => saveFile(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }), filename);

/** Template: the header plus one example product with two options. */
function templateRows(columns: ImportColumn[]): string[][] {
  const first = columns.map((c) => c.example);
  const second = columns.map((c) => {
    if (c.level === "product") return c.key === "product_slug" ? c.example : "";
    switch (c.key) {
      case "sku":
        return "AB14-16-1TB-SV";
      case "color_name":
        return "Silver";
      case "color_hex":
        return "#C9CBCE";
      case "price":
        return "36900";
      case "storage_gb":
        return "1024";
      case "compare_price":
      case "images":
        return "";
      default:
        return c.example;
    }
  });
  return [columns.map((c) => c.key), first, second];
}

/** Guide: one row per column, then the rules and the valid category and brand slugs. */
function guideRows(columns: ImportColumn[], categories: Category[], brands: Brand[]): string[][] {
  return [
    ["AURA Tech product import guide"],
    [],
    ["How it works"],
    ["1", "One row per product option (SKU). Repeat the product columns on every row of the same product, or leave them blank on the extra rows."],
    ["2", "Products are matched by product_slug (or the slug of product_name when blank). Options are matched by sku."],
    ["3", "Blank cells keep the current value of an existing product. New products and options need every 'required for new' column."],
    ["4", "Rows are never deleted: options missing from the file stay as they are."],
    ["5", "Save as CSV UTF-8. In Excel: File → Save As → CSV UTF-8 (Comma delimited)."],
    ["6", "Upload in Admin → Products → Import / export. You review every change before anything is saved."],
    [],
    ["Column", "Name", "Applies to", "Required for new", "Format", "Example", "Notes"],
    ...columns.map((c) => [c.key, c.label, c.level === "product" ? "Product" : "Option", c.required_new ? "Yes" : "", c.format, c.example, c.notes]),
    [],
    ["Category slugs", "Name"],
    ...categories.map((c) => [c.slug, c.name]),
    [],
    ["Brand slugs", "Name"],
    ...brands.map((b) => [b.slug, b.name]),
  ];
}

/** Reads a file as UTF-8, failing on other encodings (e.g. Excel's legacy Thai CSV). */
async function readUtf8(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new Error('This file isn\'t UTF-8. In Excel use "Save As → CSV UTF-8 (Comma delimited)"; in Google Sheets use "Download → CSV".');
  }
}

// ---------------------------------------------------------------- page

const STATUS_META: Record<ImportStatus, { label: string; tone: string }> = {
  create: { label: "New", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  update: { label: "Update", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  name_match: { label: "Same name", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  unchanged: { label: "No changes", tone: "bg-zinc-500/10 text-zinc-500" },
  error: { label: "Has errors", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
};

type Decisions = Record<string, { action?: ImportDecision["action"]; keep: Set<string> }>;

function defaultDecisions(preview: ImportPreview): Decisions {
  const d: Decisions = {};
  for (const p of preview.products) {
    const action = p.status === "create" ? "create" : p.status === "update" ? "update" : p.status === "name_match" ? undefined : "skip";
    d[p.key] = { action, keep: new Set() };
  }
  return d;
}

/** Admin › Products › Import / export. */
export function ProductImport() {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<ImportColumn[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ImportStatus | "all">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient<ImportColumn[]>("/admin/imports/products/columns").then((r) => setColumns(r.data || [])).catch(() => {});
    apiClient<Category[]>("/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    apiClient<Brand[]>("/brands").then((r) => setBrands(r.data || [])).catch(() => {});
  }, []);

  const back = () => navigate({ to: "/admin", search: { tab: "products" } });

  const runPreview = async (f: File) => {
    setError(null);
    setResult(null);
    setPreview(null);
    setBusy("preview");
    try {
      const text = await readUtf8(f);
      setFile({ name: f.name, text });
      const res = await apiClient<ImportPreview>("/admin/imports/products/preview", {
        method: "POST",
        body: JSON.stringify({ filename: f.name, csv: text }),
      });
      setPreview(res.data);
      setDecisions(defaultDecisions(res.data));
      setFilter("all");
    } catch (err) {
      setError((err as Error).message || "Could not read the file.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const commit = async () => {
    if (!file || !preview) return;
    setBusy("commit");
    setError(null);
    const payload: Record<string, ImportDecision> = {};
    for (const [key, d] of Object.entries(decisions)) {
      payload[key] = { action: d.action ?? "skip", keep: [...d.keep] };
    }
    try {
      const res = await apiClient<ImportResult>("/admin/imports/products/commit", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, csv: file.text, decisions: payload }),
      });
      setResult(res.data);
      setPreview(null);
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setError(apiErr.fields?.csv || apiErr.message || "Import failed.");
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    setBusy("export");
    try {
      await apiDownload("/admin/imports/products/export", `aura-products-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setDecision = (key: string, patch: Partial<Decisions[string]>) => setDecisions((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const toggleKeep = (key: string, changeKey: string) =>
    setDecisions((d) => {
      const keep = new Set(d[key].keep);
      if (keep.has(changeKey)) keep.delete(changeKey);
      else keep.add(changeKey);
      return { ...d, [key]: { ...d[key], keep } };
    });

  const undecided = preview?.products.filter((p) => p.status === "name_match" && !decisions[p.key]?.action).length ?? 0;
  const toApply = preview?.products.filter((p) => ["create", "update", "name_match"].includes(p.status) && decisions[p.key]?.action && decisions[p.key].action !== "skip").length ?? 0;
  const shown = useMemo(() => (preview ? preview.products.filter((p) => filter === "all" || p.status === filter) : []), [preview, filter]);

  const btn = "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label="Back to products" className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Import / export products</h2>
          <p className="text-xs text-zinc-500">Add or update many products from a spreadsheet. You review every change before it's saved.</p>
        </div>
      </div>

      {/* Step 1: get the file */}
      <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
        <h3 className="text-sm font-bold text-zinc-950 dark:text-white">1. Prepare a spreadsheet</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Start from the template for new products, or export the current catalogue to edit prices, stock and details. Share the guide with whoever fills it in: it explains every column and lists the valid category and brand slugs.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!columns.length} onClick={() => download(templateRows(columns), "aura-products-template.csv")} className={`${btn} bg-zinc-950 text-white dark:bg-white dark:text-zinc-950`}>
            <Download className="w-4 h-4" />
            Template (CSV)
          </button>
          <button type="button" disabled={!columns.length} onClick={() => download(guideRows(columns, categories, brands), "aura-products-guide.csv")} className={`${btn} border border-zinc-200 dark:border-zinc-700`}>
            <FileSpreadsheet className="w-4 h-4" />
            Guide (CSV)
          </button>
          <button type="button" disabled={busy === "export"} onClick={exportAll} className={`${btn} border border-zinc-200 dark:border-zinc-700`}>
            {busy === "export" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export current products
          </button>
        </div>
        <ColumnGuide columns={columns} categories={categories} brands={brands} />
      </section>

      {/* Step 2: upload */}
      <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3">
        <h3 className="text-sm font-bold text-zinc-950 dark:text-white">2. Upload and check</h3>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) runPreview(f);
          }}
          className="flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 text-center cursor-pointer hover:border-zinc-400"
        >
          {busy === "preview" ? <Loader2 className="w-6 h-6 animate-spin text-zinc-400" /> : <Upload className="w-6 h-6 text-zinc-400" />}
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{file ? file.name : "Drop a CSV here or click to choose"}</span>
          <span className="text-[11px] text-zinc-500">CSV UTF-8, up to 2 MB / 2,000 rows. Nothing is saved until you confirm.</span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && runPreview(e.target.files[0])} />
        </label>
        {error && (
          <p role="alert" className="text-xs text-rose-600 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {/* Step 3: review */}
      {preview && (
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-950 dark:text-white">3. Review</h3>
          {preview.file_issues.length > 0 && (
            <div role="alert" className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4 text-xs text-rose-700 dark:text-rose-400 space-y-1">
              {preview.file_issues.map((i, n) => (
                <p key={n}>{i.row ? `Row ${i.row}: ` : ""}{i.message}</p>
              ))}
            </div>
          )}
          {preview.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
          ))}

          {preview.products.length > 0 && (
            <>
              <div role="tablist" aria-label="Filter products" className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", `All ${preview.summary.products}`],
                    ["create", `New ${preview.summary.create}`],
                    ["update", `Update ${preview.summary.update}`],
                    ["name_match", `Same name ${preview.summary.name_match}`],
                    ["error", `Errors ${preview.summary.errors}`],
                    ["unchanged", `No changes ${preview.summary.unchanged}`],
                  ] as [ImportStatus | "all", string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${
                      filter === id ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950" : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <ul className="space-y-3">
                {shown.map((p) => (
                  <ProductReview
                    key={p.key}
                    product={p}
                    decision={decisions[p.key]}
                    onAction={(action) => setDecision(p.key, { action })}
                    onToggleKeep={(changeKey) => toggleKeep(p.key, changeKey)}
                  />
                ))}
              </ul>

              <div className="sticky bottom-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  {toApply} product{toApply === 1 ? "" : "s"} will be saved.
                  {preview.summary.errors > 0 && ` ${preview.summary.errors} with errors will be skipped.`}
                  {undecided > 0 && <strong className="text-amber-700 dark:text-amber-400"> {undecided} same-name product{undecided === 1 ? " needs" : "s need"} a decision.</strong>}
                </p>
                <button type="button" disabled={busy === "commit" || toApply === 0 || undecided > 0} onClick={commit} className={`${btn} bg-zinc-950 text-white dark:bg-white dark:text-zinc-950`}>
                  {busy === "commit" && <Loader2 className="w-4 h-4 animate-spin" />}
                  Import {toApply} product{toApply === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Step 4: result */}
      {result && (
        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4" aria-live="polite">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
              Import finished: {result.created} created, {result.updated} updated, {result.skipped} skipped{result.failed ? `, ${result.failed} failed` : ""}
            </h3>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            {result.outcomes.map((o) => (
              <li key={o.key} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-900 dark:text-white">{o.name || o.key}</span>
                  {o.message && <span className={`block ${o.status === "failed" ? "text-rose-600" : "text-amber-700 dark:text-amber-400"}`}>{o.message}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="capitalize text-zinc-500">{o.status}</span>
                  {o.product_id && (
                    <button type="button" onClick={() => navigate({ to: "/admin", search: { tab: "products", edit: o.product_id } })} className="font-semibold underline underline-offset-2 cursor-pointer">
                      Open
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setResult(null); setFile(null); }} className={`${btn} border border-zinc-200 dark:border-zinc-700`}>
            Import another file
          </button>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function ColumnGuide({ columns, categories, brands }: { columns: ImportColumn[]; categories: Category[]; brands: Brand[] }) {
  return (
    <details className="group rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <summary className="px-4 py-3 text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer select-none">How to fill in the file ({columns.length} columns)</summary>
      <div className="px-4 pb-4 space-y-4 text-xs text-zinc-600 dark:text-zinc-300">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>One row per option (SKU).</strong> Product columns repeat on each of its rows; extra rows may leave them blank.</li>
          <li>Products are matched by <code>product_slug</code> (or the slug of the name when blank); options by <code>sku</code>.</li>
          <li><strong>Blank cells keep the current value</strong> of existing products. Nothing is deleted.</li>
          <li>A file product whose name matches a different product asks you whether to update that one or add a new one.</li>
          <li>Changing <code>stock</code> on an existing option is recorded in its stock history as a count correction.</li>
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Column</th>
                <th className="py-2 pr-3">For</th>
                <th className="py-2 pr-3">New needs</th>
                <th className="py-2 pr-3">Format</th>
                <th className="py-2 pr-3">Example</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 align-top">
              {columns.map((c) => (
                <tr key={c.key}>
                  <td className="py-2 pr-3 font-mono font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{c.key}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{c.level === "product" ? "Product" : "Option"}</td>
                  <td className="py-2 pr-3">{c.required_new ? "Required" : ""}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{c.format}</td>
                  <td className="py-2 pr-3 font-mono break-all">{c.example}</td>
                  <td className="py-2 min-w-[14rem]">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Category slugs:</strong> {categories.map((c) => c.slug).join(", ") || "–"}
          <br />
          <strong>Brand slugs:</strong> {brands.map((b) => b.slug).join(", ") || "–"}
        </p>
      </div>
    </details>
  );
}

function ProductReview({
  product: p,
  decision,
  onAction,
  onToggleKeep,
}: {
  product: ImportProduct;
  decision?: Decisions[string];
  onAction: (a: ImportDecision["action"]) => void;
  onToggleKeep: (changeKey: string) => void;
}) {
  const meta = STATUS_META[p.status];
  const merging = p.status === "update" || (p.status === "name_match" && decision?.action === "update");
  const skipped = decision?.action === "skip";

  return (
    <li className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 ${skipped ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}>{meta.label}</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{p.name || p.slug}</p>
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            {p.slug} • row{p.rows.length > 1 ? "s" : ""} {p.rows.join(", ")}
          </p>
        </div>
        {(p.status === "create" || p.status === "update") && (
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={!skipped} onChange={(e) => onAction(e.target.checked ? (p.status === "create" ? "create" : "update") : "skip")} className="accent-zinc-950" />
            Import
          </label>
        )}
      </div>

      {p.status === "name_match" && p.existing && (
        <fieldset className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 space-y-2">
          <legend className="sr-only">What should happen to {p.name}?</legend>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            The store already has <strong>{p.existing.name}</strong> (<span className="font-mono">{p.existing.slug}</span>) but this file uses the slug <span className="font-mono">{p.slug}</span>. Is it the same product?
          </p>
          {(
            [
              ["update", `Same product: update “${p.existing.name}” (its slug stays)`],
              ["create", `Different product: add as new “${p.slug}”`],
              ["skip", "Skip it for now"],
            ] as [ImportDecision["action"], string][]
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
              <input type="radio" name={`decision-${p.key}`} checked={decision?.action === value} onChange={() => onAction(value)} className="accent-zinc-950" />
              {label}
            </label>
          ))}
        </fieldset>
      )}

      {p.issues.length > 0 && (
        <ul className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-400 space-y-1">
          {p.issues.map((i, n) => (
            <li key={n}>
              Row {i.row}
              {i.column && <span className="font-mono"> · {i.column}</span>}: {i.message}
            </li>
          ))}
        </ul>
      )}

      {p.new_skus.length > 0 && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          {p.status === "create" ? "Options" : "New options"}: <span className="font-mono">{p.new_skus.join(", ")}</span>
        </p>
      )}

      {merging && p.changes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-1.5 pr-3">Use file</th>
                <th className="py-1.5 pr-3">Field</th>
                <th className="py-1.5 pr-3">In store now</th>
                <th className="py-1.5">In the file</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 align-top">
              {p.changes.map((c) => {
                const useFile = !decision?.keep.has(c.key);
                return (
                  <tr key={c.key}>
                    <td className="py-1.5 pr-3">
                      <input
                        type="checkbox"
                        checked={useFile}
                        disabled={skipped}
                        onChange={() => onToggleKeep(c.key)}
                        aria-label={`Use the file's ${c.label}${c.sku ? ` for ${c.sku}` : ""}`}
                        className="accent-zinc-950"
                      />
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {c.label}
                      {c.sku && <span className="block font-mono text-[10px] text-zinc-400">{c.sku}</span>}
                    </td>
                    <td className={`py-1.5 pr-3 whitespace-pre-line break-all ${useFile ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-white font-semibold"}`}>{c.current || "–"}</td>
                    <td className={`py-1.5 whitespace-pre-line break-all ${useFile ? "text-zinc-900 dark:text-white font-semibold" : "text-zinc-400 line-through"}`}>{c.incoming || "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {merging && p.changes.length === 0 && p.new_skus.length === 0 && <p className="text-xs text-zinc-500">Nothing to change.</p>}
    </li>
  );
}
