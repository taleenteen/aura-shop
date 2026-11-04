import { useEffect, useState } from "react";
import { formatTHB } from "@/lib/currency";

interface AnimatedPriceProps {
  satang: number;
  className?: string;
}

export function AnimatedPrice({ satang, className = "" }: AnimatedPriceProps) {
  const [displayPrice, setDisplayPrice] = useState(satang);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 400; // ms
    const initialPrice = displayPrice;
    const targetPrice = satang;

    if (initialPrice === targetPrice) return;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(
        initialPrice + (targetPrice - initialPrice) * easeProgress
      );
      setDisplayPrice(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplayPrice(targetPrice);
      }
    };

    const animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [satang]);

  return <span className={className}>{formatTHB(displayPrice)}</span>;
}
