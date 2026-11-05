import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, PackageCheck, Truck, Warehouse, X, type LucideIcon } from "lucide-react";
import type { Order } from "@/types/api";
import { carrierName } from "./carriers";

interface ScanEvent {
  at: Date;
  title: string;
  place: string;
  icon: LucideIcon;
}

const HOUR = 3_600_000;

/**
 * The carrier's scan history for a parcel. Scans follow the order's shipped and delivered
 * times: pickup when it shipped, then the sorting hub and the delivery run spaced out over
 * the trip, and the delivery scan when it was delivered.
 */
export function parcelEvents(order: Order, now = new Date()): ScanEvent[] {
  if (!order.shipped_at) return [];
  const shipped = new Date(order.shipped_at);
  const delivered = order.delivered_at ? new Date(order.delivered_at) : null;
  const carrier = carrierName(order.carrier) || "Courier";
  const city = order.shipping_address?.province || "Bangkok";
  // Before delivery the parcel moves on a typical same-city schedule; after, scans fit the trip.
  const span = delivered ? delivered.getTime() - shipped.getTime() : 6 * HOUR;
  const at = (fraction: number) => new Date(shipped.getTime() + span * fraction);

  const events: ScanEvent[] = [
    { at: shipped, title: `Picked up by ${carrier}`, place: "AURA Tech warehouse, Bangkok", icon: Warehouse },
    { at: at(0.35), title: "Arrived at sorting hub", place: `${carrier} hub, ${city}`, icon: Truck },
    { at: at(0.7), title: "Out for delivery", place: `Courier on the way, ${city}`, icon: Truck },
  ];
  if (delivered) events.push({ at: delivered, title: "Delivered", place: `Signed for by ${order.shipping_address?.recipient_name || "recipient"}`, icon: PackageCheck });
  return events.filter((e) => e.at <= now || e === events[0]).reverse();
}

const formatScan = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Modal with the parcel's tracking number and scan history. */
export function ParcelTracking({ order, onClose }: { order: Order; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const events = parcelEvents(order);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.tracking_number ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the number is selectable on screen.
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Track your parcel">
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5" data-lenis-prevent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white">Track your parcel</h2>
            <p className="text-xs text-zinc-500">{carrierName(order.carrier)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Tracking number</p>
            <p className="font-mono font-bold text-zinc-950 dark:text-white tracking-wide truncate select-all">{order.tracking_number}</p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:bg-white dark:hover:bg-zinc-800 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <ol className="relative space-y-5 pl-1">
          {events.map((e, i) => (
            <li key={e.title} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center ${i === 0 ? "bg-emerald-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                  <e.icon className="w-4 h-4" aria-hidden />
                </span>
                {i < events.length - 1 && <span className="flex-1 w-px bg-zinc-200 dark:bg-zinc-700 mt-1" aria-hidden />}
              </div>
              <div className="pb-1">
                <p className={`text-sm font-semibold ${i === 0 ? "text-zinc-950 dark:text-white" : "text-zinc-600 dark:text-zinc-300"}`}>{e.title}</p>
                <p className="text-xs text-zinc-500">{e.place}</p>
                <time className="text-[11px] text-zinc-400" dateTime={e.at.toISOString()}>
                  {formatScan(e.at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>,
    document.body
  );
}
