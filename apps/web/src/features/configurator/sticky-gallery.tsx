import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ProductVariant } from "@/types/api";

interface StickyGalleryProps {
  selectedVariant: ProductVariant;
  productName: string;
}

export function StickyGallery({
  selectedVariant,
  productName,
}: StickyGalleryProps) {
  const images = Array.isArray(selectedVariant.images) && selectedVariant.images.length > 0
    ? selectedVariant.images
    : ["/placeholder-laptop.webp"];

  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // When selected variant changes, reset active image to the first view
  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedVariant.id]);

  const currentImage = images[activeImageIndex] || images[0];

  return (
    <div className="lg:sticky lg:top-24 w-full flex flex-col items-center">
      {/* Main View Area with AnimatePresence cross-fade */}
      <div className="relative w-full aspect-4/3 max-w-xl flex items-center justify-center p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden shadow-xs">
        <AnimatePresence mode="wait">
          <motion.img
            key={`${selectedVariant.id}-${activeImageIndex}`}
            src={currentImage}
            alt={`${productName} in ${selectedVariant.color_name}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="w-full h-full object-contain filter drop-shadow-xl select-none"
          />
        </AnimatePresence>

        {/* Selected Finish Pill */}
        <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 shadow-xs">
          <span
            style={{ backgroundColor: selectedVariant.color_hex }}
            className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-2xs"
          />
          <span>{selectedVariant.color_name}</span>
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
    </div>
  );
}
