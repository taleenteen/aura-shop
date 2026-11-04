import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ProductVariant } from "@/types/api";

interface StickyGalleryProps {
  selectedVariant: ProductVariant;
  productName: string;
}

export function StickyGallery({
  selectedVariant,
  productName,
}: StickyGalleryProps) {
  const images =
    Array.isArray(selectedVariant.images) && selectedVariant.images.length > 0
      ? selectedVariant.images
      : ["/placeholder-laptop.webp"];

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // When selected variant changes, reset active image to the first view
  useEffect(() => {
    setActiveImageIndex(0);
    setIsZoomed(false);
  }, [selectedVariant.id]);

  const currentImage = images[activeImageIndex] || images[0];

  const handlePrev = useCallback(() => {
    setIsZoomed(false);
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const handleNext = useCallback(() => {
    setIsZoomed(false);
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  // Keyboard navigation for Lightbox (ArrowLeft, ArrowRight, Escape)
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isZoomed) {
          setIsZoomed(false);
        } else {
          setIsLightboxOpen(false);
        }
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, isZoomed, handlePrev, handleNext]);

  return (
    <div className="lg:sticky lg:top-24 w-full flex flex-col items-center">
      {/* Main Studio View Area */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsLightboxOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setIsLightboxOpen(true)}
        className="group relative w-full aspect-4/3 max-w-xl flex items-center justify-center p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden shadow-xs cursor-zoom-in transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={`${selectedVariant.id}-${activeImageIndex}`}
            src={currentImage}
            alt={`${productName} in ${selectedVariant.color_name}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="w-full h-full object-contain filter drop-shadow-xl select-none group-hover:scale-[1.02] transition-transform duration-300"
          />
        </AnimatePresence>

        {/* Selected Finish Pill */}
        <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 shadow-xs pointer-events-none">
          <span
            style={{ backgroundColor: selectedVariant.color_hex }}
            className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-2xs"
          />
          <span>{selectedVariant.color_name}</span>
        </div>

        {/* Hover Fullscreen Prompt Badge */}
        <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Expand View</span>
        </div>
      </div>

      {/* Multiple View Thumbnails (Front, Angle, Keyboard) */}
      {images.length > 1 && (
        <div className="flex items-center gap-3 mt-4">
          {images.map((imgUrl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveImageIndex(idx)}
              className={`relative w-16 h-14 rounded-xl border p-1 bg-white dark:bg-zinc-900 transition-all cursor-pointer ${
                activeImageIndex === idx
                  ? "border-zinc-950 dark:border-white ring-2 ring-zinc-950/10 dark:ring-white/10"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={imgUrl}
                alt=""
                className="w-full h-full object-contain"
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Interactive Lightbox Modal */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-zinc-950/95 backdrop-blur-2xl text-white select-none overflow-hidden"
          >
            {/* Top Lightbox Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              {/* Product and Finish Info */}
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold">
                  <span
                    style={{ backgroundColor: selectedVariant.color_hex }}
                    className="w-3 h-3 rounded-full border border-white/40 shadow-xs"
                  />
                  <span>{selectedVariant.color_name}</span>
                </div>
                <h3 className="hidden sm:inline text-sm font-bold text-white/90">
                  {productName}
                </h3>
              </div>

              {/* View Counter */}
              {images.length > 1 && (
                <div className="text-xs font-mono text-zinc-400">
                  {activeImageIndex + 1} / {images.length}
                </div>
              )}

              {/* Top Controls: Zoom Toggle & Close */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold cursor-pointer transition-colors"
                  title={isZoomed ? "Reset Zoom" : "Zoom 2x"}
                >
                  {isZoomed ? (
                    <>
                      <ZoomOut className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">1x</span>
                    </>
                  ) : (
                    <>
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">2x</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsLightboxOpen(false);
                    setIsZoomed(false);
                  }}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Center Stage: Image and Left/Right Nav */}
            <div className="relative flex-1 flex items-center justify-center p-4 sm:p-10 overflow-hidden">
              {/* Previous Button */}
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-4 sm:left-8 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition-all cursor-pointer shadow-lg hover:scale-105"
                  title="Previous (Arrow Left)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Main Expanded Image */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsZoomed(!isZoomed)}
                onKeyDown={(e) => e.key === "Enter" && setIsZoomed(!isZoomed)}
                className={`relative max-w-5xl max-h-[75vh] flex items-center justify-center transition-transform duration-300 ease-out ${
                  isZoomed
                    ? "scale-175 cursor-zoom-out"
                    : "scale-100 cursor-zoom-in"
                }`}
              >
                <img
                  src={currentImage}
                  alt={`${productName} studio shot`}
                  className="max-h-[70vh] max-w-full object-contain filter drop-shadow-2xl select-none"
                />
              </div>

              {/* Next Button */}
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-4 sm:right-8 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition-all cursor-pointer shadow-lg hover:scale-105"
                  title="Next (Arrow Right)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Bottom Thumbnail Strip */}
            {images.length > 1 && (
              <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-white/10">
                {images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setIsZoomed(false);
                      setActiveImageIndex(idx);
                    }}
                    className={`relative w-16 h-12 rounded-xl p-1 bg-white/5 border transition-all cursor-pointer ${
                      activeImageIndex === idx
                        ? "border-white ring-2 ring-white/30 scale-105 opacity-100"
                        : "border-white/10 opacity-50 hover:opacity-80"
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
