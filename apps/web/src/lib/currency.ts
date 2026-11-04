/**
 * AURA TECH Currency Utility
 * Converts between Satang (int64 integer) and formatted Thai Baht (THB).
 * 1 THB = 100 Satang.
 * Example: 5990000 Satang = ฿59,900
 */

export function satangToBaht(satang: number | bigint): number {
  return Number(satang) / 100;
}

export function bahtToSatang(baht: number): number {
  return Math.round(baht * 100);
}

export function formatTHB(
  satang: number | bigint,
  options: { includeDecimals?: boolean; showPrefix?: boolean } = {}
): string {
  const { includeDecimals = false, showPrefix = true } = options;
  const baht = satangToBaht(satang);

  const formattedNumber = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(baht);

  return showPrefix ? `฿${formattedNumber}` : formattedNumber;
}

export function formatMonthlyInstallment(
  satang: number | bigint,
  months: number = 10
): string {
  if (months <= 0) return formatTHB(satang);
  const monthlySatang = Math.round(Number(satang) / months);
  return `${formatTHB(monthlySatang)}/mo. for ${months} mos.`;
}

export function calculatePriceDelta(
  targetPriceSatang: number,
  basePriceSatang: number
): { formatted: string; delta: number; sign: "+" | "-" | "" } {
  const delta = targetPriceSatang - basePriceSatang;
  if (delta === 0) {
    return { formatted: "Included", delta: 0, sign: "" };
  }
  const sign = delta > 0 ? "+" : "-";
  const absDelta = Math.abs(delta);
  return {
    formatted: `${sign} ${formatTHB(absDelta)}`,
    delta,
    sign,
  };
}
