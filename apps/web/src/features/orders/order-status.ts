import { CheckCircle2, Clock, Package, PackageCheck, Truck, XCircle, type LucideIcon } from "lucide-react";
import type { Order, OrderStatus } from "@/types/api";

export const STATUS_META: Record<OrderStatus, { label: string; icon: LucideIcon; tone: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", icon: Clock, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  PAID_PROCESSING: { label: "Preparing your order", icon: Package, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  SN_ASSIGNED: { label: "Packed, ready to ship", icon: PackageCheck, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  SHIPPED: { label: "On the way", icon: Truck, tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20" },
  DELIVERED: { label: "Delivered", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  CANCELLED: { label: "Cancelled", icon: XCircle, tone: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20" },
};

/** Progress steps shown on active orders; index of the step each status has reached. */
export const STEPS = ["Ordered", "Paid", "Packed", "Shipped", "Delivered"];
export const STEP_REACHED: Record<OrderStatus, number> = {
  PENDING_PAYMENT: 0,
  PAID_PROCESSING: 1,
  SN_ASSIGNED: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  CANCELLED: -1,
};

/** An unpaid order whose 15-minute hold is still running, so it can still be paid. */
export const isPayable = (order: Order, now = new Date()) =>
  order.status === "PENDING_PAYMENT" && new Date(order.reservation_expires_at) > now;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
