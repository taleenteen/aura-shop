import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useWishlistStore } from "@/stores/wishlist-store";

interface WishlistHeartButtonProps {
  productId: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const PARTICLE_ANGLES = [0, 60, 120, 180, 240, 300];

export function WishlistHeartButton({
  productId,
  className = "",
  size = "md",
}: WishlistHeartButtonProps) {
  const isLiked = useWishlistStore((state) => state.isLiked(productId));
  const toggleLike = useWishlistStore((state) => state.toggleLike);

  const [isHovered, setIsHovered] = useState(false);
  const [showBurst, setShowBurst] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const willBeLiked = !isLiked;
    if (willBeLiked) {
      setShowBurst(true);
      setTimeout(() => setShowBurst(false), 400);
    }

    try {
      await toggleLike(productId);
    } catch {
      // Reverted in store
    }
  };

  const buttonSizeClasses = {
    sm: "w-8 h-8",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  }[size];

  const iconSizes = {
    sm: 15,
    md: 18,
    lg: 22,
  }[size];

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileTap={{ scale: 0.82 }}
      animate={{ scale: isHovered ? 1.08 : 1 }}
      transition={{ duration: 0.2 }}
      aria-label={isLiked ? "Remove from wishlist" : "Add to wishlist"}
      className={`relative rounded-full backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs flex items-center justify-center cursor-pointer transition-colors ${buttonSizeClasses} ${className}`}
    >
      {/* 6-Particle Radial SVG Micro-burst on Like */}
      <AnimatePresence>
        {showBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {PARTICLE_ANGLES.map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const targetX = Math.round(Math.cos(rad) * 14);
              const targetY = Math.round(Math.sin(rad) * 14);

              return (
                <motion.div
                  key={angle}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: targetX, y: targetY, opacity: 0, scale: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute w-1.5 h-1.5 rounded-full bg-rose-500"
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Heart SVG with 4 physical states */}
      <motion.svg
        width={iconSizes}
        height={iconSizes}
        viewBox="0 0 24 24"
        animate={
          isLiked
            ? {
                scale: showBurst ? [0.82, 1.32, 1] : 1,
                fill: "#F43F5E",
                stroke: "#F43F5E",
              }
            : isHovered
              ? {
                  scale: [1, 1.18, 1],
                  fill: "transparent",
                  stroke: "#F43F5E",
                }
              : {
                  scale: 1,
                  fill: "transparent",
                  stroke: "#52525B",
                }
        }
        transition={
          isLiked && showBurst
            ? { type: "spring", stiffness: 500, damping: 15 }
            : isHovered
              ? { duration: 0.28, ease: "easeInOut" }
              : { duration: 0.2 }
        }
        style={{
          strokeWidth: 1.8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </motion.svg>
    </motion.button>
  );
}
