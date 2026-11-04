import { motion } from "motion/react";
import {
  BatteryCharging,
  Cpu,
  Sparkles,
  Monitor,
  Feather,
  Wifi,
  Zap,
  Volume2,
} from "lucide-react";
import type { BentoHighlightItem } from "@/types/api";

interface BentoHighlightsProps {
  highlights?: BentoHighlightItem[];
  productName: string;
}

const ICON_MAP: Record<string, typeof Sparkles> = {
  BatteryCharging,
  Cpu,
  Sparkles,
  Monitor,
  Feather,
  Wifi,
  Zap,
  Volume2,
};

export function BentoHighlights({
  highlights = [],
  productName,
}: BentoHighlightsProps) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="py-16 border-t border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Key Highlights
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 dark:text-white mt-1.5">
            Meticulously Engineered for {productName}
          </h2>
        </div>

        {/* 6-Card Responsive Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {highlights.map((item, idx) => {
            const IconComponent = ICON_MAP[item.icon] || Sparkles;
            const isSpan2 = item.span === "col-span-2";

            return (
              <motion.div
                key={item.id || idx}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className={`p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 flex flex-col justify-between overflow-hidden shadow-xs relative group ${
                  isSpan2 ? "md:col-span-2" : "md:col-span-1"
                }`}
              >
                {/* Header Icon & Eyebrow */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-900 dark:text-white shadow-2xs">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {item.eyebrow}
                    </span>
                  </div>

                  {/* Big Hero Metric */}
                  <div className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 dark:text-white">
                    {item.big_metric}
                  </div>

                  <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 mt-2">
                    {item.title}
                  </h3>
                </div>

                {/* Description */}
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-4 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
