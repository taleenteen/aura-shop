import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface ReservationTimerProps {
  expiresAt: string;
  onExpired?: () => void;
}

export function ReservationTimer({
  expiresAt,
  onExpired,
}: ReservationTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const diff = Math.floor(
      (new Date(expiresAt).getTime() - new Date().getTime()) / 1000
    );
    return Math.max(0, diff);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor(
        (new Date(expiresAt).getTime() - new Date().getTime()) / 1000
      );
      if (diff <= 0) {
        setSecondsRemaining(0);
        clearInterval(interval);
        onExpired?.();
      } else {
        setSecondsRemaining(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const isUrgent = secondsRemaining < 180; // Under 3 minutes
  const isExpired = secondsRemaining === 0;

  return (
    <div
      className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-colors ${
        isExpired
          ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
          : isUrgent
            ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
      }`}
    >
      <div className="flex items-center gap-3">
        {isExpired || isUrgent ? (
          <AlertTriangle className="w-5 h-5 shrink-0" />
        ) : (
          <Clock className="w-5 h-5 shrink-0 animate-pulse" />
        )}
        <div>
          <div className="font-bold text-xs uppercase tracking-wider">
            {isExpired
              ? "Stock Reservation Expired"
              : "Hardware Allocation Reserved"}
          </div>
          <div className="text-xs opacity-90 mt-0.5">
            {isExpired
              ? "Your 15-minute stock hold has expired. Please re-add items to bag."
              : "Items are temporarily locked for 15 minutes while you complete checkout."}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-xl sm:text-2xl font-mono font-black tracking-tight">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}
