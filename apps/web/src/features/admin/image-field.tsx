import { useRef, useState } from "react";
import { ImageOff, Loader2, Upload } from "lucide-react";
import { apiUpload } from "@/lib/api-client";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  hint?: string;
}

/** An image URL field with an upload button; uploads go to the store's image bucket. */
export function ImageField({ id, label, value, onChange, error, hint }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setUploadError(null);
    try {
      const res = await apiUpload<{ url: string }>("/admin/uploads/images", file);
      onChange(res.url);
    } catch (err) {
      setUploadError((err as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="w-10 h-10 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
          {value ? <img src={value} alt="" className="max-w-full max-h-full object-contain" /> : <ImageOff className="w-4 h-4 text-zinc-400" />}
        </div>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload"
          className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
          aria-invalid={!!error}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={`Upload ${label}`}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>
      {(error || uploadError) && <p className="mt-1 text-[11px] text-rose-600">{error || uploadError}</p>}
      {hint && !error && !uploadError && <p className="mt-1 text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}
