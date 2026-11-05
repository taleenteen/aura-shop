import type { Carrier } from "@/types/api";

export const CARRIERS: Record<Carrier, { name: string; example: string }> = {
  KERRY: { name: "Kerry Express", example: "KEX1234567890" },
  FLASH: { name: "Flash Express", example: "TH0123456789A" },
  DHL: { name: "DHL Express", example: "5012345678" },
};

export const carrierName = (code?: string | null) =>
  (code && CARRIERS[code as Carrier]?.name) || code || "";
