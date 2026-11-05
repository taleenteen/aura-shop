import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Zap } from "lucide-react";
import type { Banner } from "@/types/api";

interface TopRibbonProps {
  banner?: Banner;
}

export function TopRibbon({ banner }: TopRibbonProps) {
  const navigate = useNavigate();
  const headline =
    banner?.headline ||
    "⚡ FLASH TECH FEST: 0% Installment up to 10 Months + Free 3-Hour Express Delivery in Bangkok";
  const link = banner?.cta_primary_link;
  const internal = link?.startsWith("/");

  const content = (
    <>
      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 fill-amber-400" />
      <span className="tracking-wide">{headline}</span>
      {link && <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden />}
    </>
  );

  return (
    <aside
      aria-label="Storewide Announcement"
      className="w-full text-[11px] sm:text-xs font-medium py-2 px-4 border-b border-zinc-800 flex items-center justify-center text-center"
      style={{ backgroundColor: banner?.background_color || "#09090B", color: banner?.theme_mode === "LIGHT" ? "#09090B" : "#FFFFFF" }}
    >
      {link ? (
        <a
          href={link}
          onClick={(e) => {
            if (!internal) return;
            e.preventDefault();
            navigate({ href: link });
          }}
          {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          className="flex items-center gap-2 max-w-7xl mx-auto hover:underline underline-offset-2"
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-2 max-w-7xl mx-auto">{content}</div>
      )}
    </aside>
  );
}
