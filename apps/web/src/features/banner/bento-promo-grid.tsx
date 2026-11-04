import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, GraduationCap, Gamepad2, Sparkles, Layers } from "lucide-react";
import type { Banner } from "@/types/api";

interface BentoPromoGridProps {
  banners?: Banner[];
}

export function BentoPromoGrid({ banners = [] }: BentoPromoGridProps) {
  // Static fallback bento cards if banners are empty
  const defaultCards = [
    {
      id: "bento-1",
      grid_span: "col-span-1 md:col-span-2 md:row-span-2",
      badge_text: "PRO GAMING & AI",
      headline: "ASUS ROG Zephyrus G16",
      subheadline:
        "240Hz 2.5K OLED display powered by Intel Core Ultra 9 & RTX 4080. Ultra-slim CNC aluminum chassis.",
      cta_primary_link: "/products/asus-rog-zephyrus-g16-oled",
      cta_primary_text: "Explore G16",
      background_color: "#0F1117",
      theme_mode: "DARK",
      icon: Gamepad2,
    },
    {
      id: "bento-2",
      grid_span: "col-span-1 md:col-span-2 md:row-span-1",
      badge_text: "EDUCATION PRICING",
      headline: "University U-Store Discounts",
      subheadline:
        "Students and educators save up to ฿5,500 on MacBook Air M3 plus free AirPods on eligible purchases.",
      cta_primary_link: "/catalog?category=mac",
      cta_primary_text: "View Student Offers",
      background_color: "#18181B",
      theme_mode: "DARK",
      icon: GraduationCap,
    },
    {
      id: "bento-3",
      grid_span: "col-span-1 md:col-span-1 md:row-span-1",
      badge_text: "CREATOR GEAR",
      headline: "LG UltraFine 5K",
      subheadline: "5120x2880 IPS with 96W Thunderbolt charging.",
      cta_primary_link: "/products/lg-ultrafine-5k-27md5kl",
      cta_primary_text: "See Display",
      background_color: "#1C1D22",
      theme_mode: "DARK",
      icon: Sparkles,
    },
    {
      id: "bento-4",
      grid_span: "col-span-1 md:col-span-1 md:row-span-1",
      badge_text: "CUSTOM HARDWARE",
      headline: "Keychron Q1 Pro",
      subheadline: "Wireless QMK/VIA custom mechanical keyboard.",
      cta_primary_link: "/products/keychron-q1-pro-wireless-custom",
      cta_primary_text: "Customize",
      background_color: "#18181B",
      theme_mode: "DARK",
      icon: Layers,
    },
  ];

  const cardsToRender = banners.length > 0 ? banners : defaultCards;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Featured Campaigns
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white mt-1">
            Engineered For What's Next
          </h2>
        </div>
        <Link
          to="/catalog"
          className="text-xs font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1 transition-colors"
        >
          <span>All Deals</span>
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 auto-rows-[220px]">
        {cardsToRender.map((card, idx) => {
          const isDark = card.theme_mode !== "LIGHT";
          return (
            <motion.div
              key={card.id || idx}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
              style={{ backgroundColor: card.background_color || "#18181B" }}
              className={`group relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between overflow-hidden border border-zinc-800 shadow-sm transition-transform hover:-translate-y-1 duration-200 ${
                card.grid_span || "col-span-1"
              }`}
            >
              {/* Subtle Ambient Glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/15 transition-all" />

              {/* Card Header & Badge */}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 text-zinc-200 border border-white/10">
                    {card.badge_text}
                  </span>
                </div>

                <h3
                  className={`font-bold tracking-tight ${
                    card.grid_span?.includes("row-span-2")
                      ? "text-2xl sm:text-3xl"
                      : "text-lg sm:text-xl"
                  } ${isDark ? "text-white" : "text-zinc-950"}`}
                >
                  {card.headline}
                </h3>

                <p
                  className={`mt-2 text-xs sm:text-sm line-clamp-3 leading-relaxed max-w-md ${
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  }`}
                >
                  {card.subheadline}
                </p>
              </div>

              {/* Card Footer CTA */}
              <div className="relative z-10 pt-4">
                <Link
                  to={card.cta_primary_link || "/catalog"}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white group-hover:underline underline-offset-4"
                >
                  <span>{card.cta_primary_text || "Learn More"}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
