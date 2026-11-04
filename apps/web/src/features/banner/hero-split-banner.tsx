import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { Banner } from "@/types/api";

interface HeroSplitBannerProps {
  banner?: Banner;
}

export function HeroSplitBanner({ banner }: HeroSplitBannerProps) {
  const isDark = banner?.theme_mode !== "LIGHT";

  const badgeText = banner?.badge_text || "NEW M4 PRO CHIP";
  const headline =
    banner?.headline || "MacBook Pro 14 with M4 Pro";
  const subheadline =
    banner?.subheadline ||
    "Mind-blowing performance with up to 24 hours of battery life. Built for Apple Intelligence.";
  const imageUrl =
    banner?.product_image_url || "/assets/macbook-pro-space-black.webp";
  const primaryCtaText = banner?.cta_primary_text || "Shop Now";
  const primaryCtaLink = banner?.cta_primary_link || "/products/macbook-pro-14-m4";
  const secondaryCtaText = banner?.cta_secondary_text || "Compare Models";
  const secondaryCtaLink = banner?.cta_secondary_link || "/catalog";

  const bgStyle = banner?.background_color
    ? { backgroundColor: banner.background_color }
    : isDark
      ? { backgroundColor: "#090A0F" }
      : { backgroundColor: "#F5F5F7" };

  return (
    <section
      style={bgStyle}
      className={`relative w-full overflow-hidden transition-colors ${
        isDark ? "text-zinc-100" : "text-zinc-900"
      }`}
    >
      {/* Subtle background ambient radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background: isDark
            ? "radial-gradient(circle at 75% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)"
            : "radial-gradient(circle at 75% 30%, rgba(200, 205, 230, 0.3) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-28 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Typography & CTAs */}
        <div className="lg:col-span-6 xl:col-span-7 space-y-6 text-center lg:text-left">
          {/* Animated Pill Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 text-xs font-bold tracking-wider uppercase rounded-full border shadow-xs"
            style={{
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.06)",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.12)",
              color: isDark ? "#E4E4E7" : "#27272A",
            }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{badgeText}</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-tight leading-[1.08]"
          >
            {headline}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className={`text-base sm:text-lg max-w-xl mx-auto lg:mx-0 leading-relaxed ${
              isDark ? "text-zinc-400" : "text-zinc-600"
            }`}
          >
            {subheadline}
          </motion.p>

          {/* Pricing Highlight */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 text-sm font-medium"
          >
            <span className="text-xl sm:text-2xl font-bold tracking-tight">
              From ฿59,900
            </span>
            <span className="hidden sm:inline text-zinc-500">•</span>
            <span className="text-emerald-500 font-semibold">
              or ฿5,990/mo. for 10 mos. with 0% interest
            </span>
          </motion.div>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-4"
          >
            <Link
              to={primaryCtaLink}
              className={`inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold text-sm shadow-md transition-transform hover:scale-105 active:scale-95 ${
                isDark
                  ? "bg-white text-zinc-950 hover:bg-zinc-100"
                  : "bg-zinc-950 text-white hover:bg-zinc-800"
              }`}
            >
              <span>{primaryCtaText}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to={secondaryCtaLink}
              className={`inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold text-sm border backdrop-blur-md transition-colors ${
                isDark
                  ? "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  : "border-zinc-300 bg-white/70 text-zinc-700 hover:bg-white hover:text-zinc-950"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{secondaryCtaText}</span>
            </Link>
          </motion.div>
        </div>

        {/* Right Column: Floating High-Res Product Cutout */}
        <div className="lg:col-span-6 xl:col-span-5 flex items-center justify-center">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-full max-w-lg aspect-4/3 flex items-center justify-center"
          >
            <img
              src={imageUrl}
              alt={headline}
              className="w-full h-full object-contain filter drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] select-none"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
