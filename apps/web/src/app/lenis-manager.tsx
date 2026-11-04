import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { useUIStore } from "@/stores/ui-store";

interface LenisManagerProps {
  pathname: string;
}

export function LenisManager({ pathname }: LenisManagerProps) {
  const isCartOpen = useUIStore((state) => state.isCartOpen);
  const isCommandPaletteOpen = useUIStore((state) => state.isCommandPaletteOpen);
  const isCompareOpen = useUIStore((state) => state.isCompareOpen);

  const lenisRef = useRef<Lenis | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. Strict route gating:
    // Only enabled on Landing Page ('/') and Product Detail Pages ('/products/:slug')
    // Excluded on /products/compare, /checkout, /orders, and all /admin/* routes
    const isLandingPage = pathname === "/" || pathname === "";
    const isProductDetailPage =
      pathname.startsWith("/products/") && pathname !== "/products/compare";
    const isAllowedRoute = isLandingPage || isProductDetailPage;

    // 2. Strict modal/drawer gating:
    // Disabled whenever any drawer or modal is open to prevent scroll hijacking
    const isModalOpen = isCartOpen || isCommandPaletteOpen || isCompareOpen;
    const shouldEnable = isAllowedRoute && !isModalOpen;

    if (shouldEnable) {
      if (!lenisRef.current) {
        const lenis = new Lenis({
          duration: 1.2,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: "vertical",
          gestureOrientation: "vertical",
          smoothWheel: true,
          touchMultiplier: 1.5,
        });

        lenisRef.current = lenis;

        const raf = (time: number) => {
          lenis.raf(time);
          rafIdRef.current = requestAnimationFrame(raf);
        };
        rafIdRef.current = requestAnimationFrame(raf);
      } else {
        lenisRef.current.start();
      }
    } else {
      if (lenisRef.current) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        lenisRef.current.destroy();
        lenisRef.current = null;
        document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling");
      }
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
        document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling");
      }
    };
  }, [pathname, isCartOpen, isCommandPaletteOpen, isCompareOpen]);

  return null;
}
