import { Link } from "@tanstack/react-router";
import { Sparkles, Gamepad2, Feather, Briefcase } from "lucide-react";

export function PersonaQuickLinks() {
  const personas = [
    {
      id: "CREATOR",
      title: "Creator Workstation",
      desc: "Video 8K, 3D render & music production",
      icon: Sparkles,
      color: "from-purple-500/10 to-indigo-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
    },
    {
      id: "GAMING",
      title: "High-FPS Gaming",
      desc: "240Hz OLED & dedicated RTX 40-Series",
      icon: Gamepad2,
      color: "from-rose-500/10 to-amber-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
    },
    {
      id: "ULTRALIGHT",
      title: "Ultralight Mobility",
      desc: "Under 1.3 kg with 18+ hours battery",
      icon: Feather,
      color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "OFFICE",
      title: "Study & Office Pro",
      desc: "Silent fanless chassis & crisp typing",
      icon: Briefcase,
      color: "from-blue-500/10 to-cyan-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    },
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {personas.map((p) => (
          <Link
            key={p.id}
            to="/catalog"
            search={{ persona: p.id }}
            className={`group relative p-5 rounded-2xl border bg-gradient-to-br transition-all hover:-translate-y-0.5 hover:shadow-md ${p.color}`}
          >
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-current/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <p.icon className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
              {p.title}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              {p.desc}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
