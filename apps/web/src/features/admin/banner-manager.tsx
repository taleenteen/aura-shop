import React, { useState } from "react";
import { Sparkles, Check, ArrowRight, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { Banner, BannerPlacement, BannerThemeMode } from "@/types/api";

export function BannerManager() {
  const [placement, setPlacement] = useState<BannerPlacement>("HERO_SPLIT");
  const [themeMode, setThemeMode] = useState<BannerThemeMode>("DARK");
  const [backgroundColor, setBackgroundColor] = useState("#090A0F");
  const [badgeText, setBadgeText] = useState("SPECIAL EDITION");
  const [headline, setHeadline] = useState("Next-Gen Apple Silicon M4 Max");
  const [subheadline, setSubheadline] = useState(
    "Unrivaled computational power for 3D simulation and machine learning."
  );
  const [imageUrl, setImageUrl] = useState(
    "/assets/macbook-pro-space-black.webp"
  );
  const [ctaPrimaryText, setCtaPrimaryText] = useState("Order Now");
  const [ctaPrimaryLink, setCtaPrimaryLink] = useState(
    "/products/macbook-pro-14-m4"
  );

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 90);

    try {
      await apiClient<Banner>("/admin/banners", {
        method: "POST",
        body: JSON.stringify({
          placement,
          theme_mode: themeMode,
          background_color: backgroundColor,
          badge_text: badgeText,
          headline,
          subheadline,
          product_image_url: imageUrl,
          cta_primary_text: ctaPrimaryText,
          cta_primary_link: ctaPrimaryLink,
          start_at: now.toISOString(),
          end_at: end.toISOString(),
          is_active: true,
        }),
      });

      setSuccessMsg("Banner campaign published successfully!");
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const isDark = themeMode === "DARK";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
          Component-Driven Dynamic Banner Manager
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Create responsive HTML/CSS banners with native typography and zero image text pixelation.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Inputs */}
        <form
          onSubmit={handleCreate}
          className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs"
        >
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Placement Type
              </label>
              <select
                value={placement}
                onChange={(e) =>
                  setPlacement(e.target.value as BannerPlacement)
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              >
                <option value="HERO_SPLIT">Hero Split (Flagship)</option>
                <option value="BENTO_GRID">Bento Promo Grid</option>
                <option value="TOP_RIBBON">Top Ribbon Announcement</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Theme Mode
              </label>
              <select
                value={themeMode}
                onChange={(e) =>
                  setThemeMode(e.target.value as BannerThemeMode)
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              >
                <option value="DARK">Dark Mode (Light Text)</option>
                <option value="LIGHT">Light Mode (Dark Text)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Badge Text
              </label>
              <input
                type="text"
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Background Hex
              </label>
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Headline
            </label>
            <input
              type="text"
              required
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Subheadline
            </label>
            <textarea
              rows={2}
              value={subheadline}
              onChange={(e) => setSubheadline(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Product PNG Cutout URL
            </label>
            <input
              type="text"
              required
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                CTA Button Text
              </label>
              <input
                type="text"
                value={ctaPrimaryText}
                onChange={(e) => setCtaPrimaryText(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                CTA Target Link
              </label>
              <input
                type="text"
                value={ctaPrimaryLink}
                onChange={(e) => setCtaPrimaryLink(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Publishing Banner...</span>
              </>
            ) : (
              <span>Deploy Banner Campaign</span>
            )}
          </button>
        </form>

        {/* Live Preview Card */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
            <Sparkles className="w-4 h-4" />
            <span>Interactive Live Banner Preview</span>
          </div>

          <div
            style={{ backgroundColor }}
            className={`p-8 rounded-3xl border border-zinc-800 shadow-xl space-y-6 overflow-hidden ${
              isDark ? "text-white" : "text-zinc-950"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
                {badgeText}
              </span>
              <span className="text-[10px] font-mono opacity-60">
                {themeMode} MODE
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black tracking-tight leading-tight">
                {headline}
              </h3>
              <p
                className={`text-xs leading-relaxed max-w-sm ${
                  isDark ? "text-zinc-400" : "text-zinc-600"
                }`}
              >
                {subheadline}
              </p>
            </div>

            <div className="w-full aspect-16/9 flex items-center justify-center">
              <img
                src={imageUrl}
                alt="Cutout Preview"
                className="max-h-full max-w-full object-contain filter drop-shadow-md"
              />
            </div>

            <div className="pt-2">
              <span
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold shadow-md ${
                  isDark
                    ? "bg-white text-zinc-950"
                    : "bg-zinc-950 text-white"
                }`}
              >
                <span>{ctaPrimaryText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
