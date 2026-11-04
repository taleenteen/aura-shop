import { Zap } from "lucide-react";
import type { Banner } from "@/types/api";

interface TopRibbonProps {
  banner?: Banner;
}

export function TopRibbon({ banner }: TopRibbonProps) {
  const headline =
    banner?.headline ||
    "⚡ FLASH TECH FEST: 0% Installment up to 10 Months + Free 3-Hour Express Delivery in Bangkok";

  return (
    <aside aria-label="Storewide Announcement" className="w-full bg-zinc-950 text-white text-[11px] sm:text-xs font-medium py-2 px-4 border-b border-zinc-800 flex items-center justify-center text-center">
      <div className="flex items-center gap-2 max-w-7xl mx-auto">
        <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 fill-amber-400" />
        <span className="tracking-wide">{headline}</span>
      </div>
    </aside>
  );
}
