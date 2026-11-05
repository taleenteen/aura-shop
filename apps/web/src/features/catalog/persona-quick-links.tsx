import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, Feather, Gamepad2, Sparkles, type LucideIcon } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { Product } from "@/types/api";

interface Persona {
  id: "CREATOR" | "GAMING" | "ULTRALIGHT" | "OFFICE";
  title: string;
  desc: string;
  icon: LucideIcon;
  /** Card surface: a dark gradient per use case so white text and product shots read clearly. */
  surface: string;
  /** Accent for the icon chip and the soft glow behind the product. */
  accent: string;
  glow: string;
}

const PERSONAS: Persona[] = [
  {
    id: "CREATOR",
    title: "Creator Workstation",
    desc: "8K video, 3D render & music production",
    icon: Sparkles,
    surface: "from-violet-950 via-indigo-950 to-zinc-950",
    accent: "bg-violet-400/15 text-violet-200 border-violet-300/20",
    glow: "bg-violet-500/30",
  },
  {
    id: "GAMING",
    title: "High-FPS Gaming",
    desc: "240Hz OLED & dedicated RTX 40-Series",
    icon: Gamepad2,
    surface: "from-rose-950 via-zinc-950 to-zinc-950",
    accent: "bg-rose-400/15 text-rose-200 border-rose-300/20",
    glow: "bg-rose-500/30",
  },
  {
    id: "ULTRALIGHT",
    title: "Ultralight Mobility",
    desc: "Under 1.3 kg with 18+ hours battery",
    icon: Feather,
    surface: "from-emerald-950 via-teal-950 to-zinc-950",
    accent: "bg-emerald-400/15 text-emerald-200 border-emerald-300/20",
    glow: "bg-emerald-500/30",
  },
  {
    id: "OFFICE",
    title: "Study & Office Pro",
    desc: "Silent fanless chassis & crisp typing",
    icon: Briefcase,
    surface: "from-sky-950 via-slate-900 to-zinc-950",
    accent: "bg-sky-400/15 text-sky-200 border-sky-300/20",
    glow: "bg-sky-500/30",
  },
];

/** What the catalog says about one persona: how many models, and a flagship photo. */
interface PersonaStats {
  count: number;
  image: string | null;
}

const productImage = (p: Product) => p.variants?.[0]?.images?.[0] ?? null;

/**
 * Loads every persona's model count and picks one flagship photo per card: the persona's most
 * expensive product that no other card already shows.
 */
async function loadAllStats(): Promise<Record<Persona["id"], PersonaStats>> {
  const results = await Promise.all(
    PERSONAS.map((p) => apiClient<Product[]>(`/catalog?persona=${p.id}&sort=price_desc&limit=8`))
  );
  const used = new Set<string>();
  const out = {} as Record<Persona["id"], PersonaStats>;
  // Personas with the fewest products choose first, so a small group (e.g. gaming) keeps its
  // own flagship instead of losing it to a larger group that shares the product.
  const order = PERSONAS.map((p, i) => ({ p, i, count: results[i].meta?.total_items ?? 0 })).sort((a, b) => a.count - b.count);
  for (const { p, i, count } of order) {
    const products = (results[i].data || []).filter((prod) => productImage(prod));
    const pick = products.find((prod) => !used.has(prod.id)) ?? products[0];
    if (pick) used.add(pick.id);
    out[p.id] = { count, image: pick ? productImage(pick) : null };
  }
  return out;
}

export function PersonaQuickLinks() {
  const [stats, setStats] = useState<Partial<Record<Persona["id"], PersonaStats>>>({});

  useEffect(() => {
    let cancelled = false;
    loadAllStats()
      .then((all) => !cancelled && setStats(all))
      .catch(() => {
        // Cards still link to the filtered catalog; they just show no count or photo.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      <div className="mb-5">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Shop by use</span>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-950 dark:text-white mt-0.5">
          What will you use it for?
        </h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {PERSONAS.map((p) => {
          const s = stats[p.id];
          const figures = s && s.count > 0 ? `${s.count} ${s.count === 1 ? "model" : "models"}` : null;
          return (
            <Link
              key={p.id}
              to="/catalog"
              search={{ persona: p.id }}
              aria-label={figures ? `${p.title}: ${figures}` : p.title}
              className={`group relative isolate overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br ${p.surface} p-4 sm:p-5 min-h-[168px] sm:min-h-[220px] flex flex-col shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-white`}
            >
              {/* Glow behind the product shot */}
              <div className={`absolute -right-8 -bottom-8 w-40 h-40 sm:w-48 sm:h-48 rounded-full blur-3xl ${p.glow} -z-10 transition-opacity duration-300 opacity-70 group-hover:opacity-100`} />

              <span className={`self-start inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl border ${p.accent}`}>
                <p.icon className="w-4 h-4" aria-hidden />
              </span>

              <h3 className="mt-3 font-bold text-sm sm:text-base text-white leading-snug ">{p.title}</h3>
              <p className="hidden sm:block mt-1 text-xs text-zinc-300/90 leading-relaxed">{p.desc}</p>

              <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                <div className="shrink-0">
                  {figures ? (
                    <p className="text-[11px] sm:text-xs font-semibold text-white/80">{figures}</p>
                  ) : (
                    <p className="h-4 w-16 rounded bg-white/10 animate-pulse" aria-hidden />
                  )}
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-white">
                    Shop now
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
                {s?.image && (
                  <img
                    src={s.image}
                    alt=""
                    loading="lazy"
                    className="pointer-events-none w-[52%] max-w-[150px] h-14 sm:h-20 object-contain object-right-bottom drop-shadow-2xl transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-2"
                  />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
