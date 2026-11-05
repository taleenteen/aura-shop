import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { formatTHB } from "@/lib/currency";
import type { InstallmentPlanData } from "@/types/api";
import { z } from "zod";
import { validate } from "@/lib/validation";

const planSchema = z.object({
  bank_code: z.enum(["KBANK", "SCB", "KRUNGSRI", "BBL"]),
  months: z.union([z.literal(3), z.literal(6), z.literal(10)]),
});

interface InstallmentCalculatorProps {
  totalSatang: number;
  onPay: (plan: InstallmentPlanData) => Promise<void>;
  isLoading: boolean;
}

const BANKS: Array<{ code: InstallmentPlanData["bank_code"]; name: string }> = [
  { code: "KBANK", name: "Kasikornbank (K-Bank)" },
  { code: "SCB", name: "Siam Commercial Bank (SCB)" },
  { code: "KRUNGSRI", name: "Bank of Ayudhya (Krungsri)" },
  { code: "BBL", name: "Bangkok Bank (BBL)" },
];

const TENURES: Array<InstallmentPlanData["months"]> = [3, 6, 10];

export function InstallmentCalculator({
  totalSatang,
  onPay,
  isLoading,
}: InstallmentCalculatorProps) {
  const [selectedBank, setSelectedBank] = useState<InstallmentPlanData["bank_code"]>("KBANK");
  const [selectedMonths, setSelectedMonths] = useState<InstallmentPlanData["months"]>(10);

  const bankName =
    BANKS.find((b) => b.code === selectedBank)?.name || "Kasikornbank";
  const monthlyPaySatang = Math.round(totalSatang / selectedMonths);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The choices come from fixed buttons; the schema keeps every form on the same pattern
    // and matches the banks and tenures the API accepts.
    const checked = validate(planSchema, { bank_code: selectedBank, months: selectedMonths });
    if (!checked.ok) return;
    onPay({
      bank_code: checked.data.bank_code,
      bank_name: bankName,
      months: checked.data.months,
      interest_rate: 0,
      monthly_pay_satang: monthlyPaySatang,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Select Bank */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
          Select Participating Credit Card Issuer (0% Interest)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {BANKS.map((b) => {
            const isSelected = selectedBank === b.code;
            return (
              <button
                key={b.code}
                type="button"
                onClick={() => setSelectedBank(b.code)}
                className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? "border-zinc-950 dark:border-white bg-zinc-50 dark:bg-zinc-800/80 ring-1 ring-zinc-950 dark:ring-white"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 bg-white dark:bg-zinc-900"
                }`}
              >
                <div>
                  <div className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white">
                    {b.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    {b.code} Smart Pay
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Select Months Tenure */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2.5">
          Select Installment Period
        </label>
        <div className="grid grid-cols-3 gap-3">
          {TENURES.map((m) => {
            const isSelected = selectedMonths === m;
            const monthly = Math.round(totalSatang / m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonths(m)}
                className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? "border-zinc-950 dark:border-white bg-zinc-50 dark:bg-zinc-800/80 ring-1 ring-zinc-950 dark:ring-white"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 bg-white dark:bg-zinc-900"
                }`}
              >
                <div className="font-black text-lg text-zinc-950 dark:text-white">
                  {m} Months
                </div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                  0% Interest
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {formatTHB(monthly)}/mo.
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Box */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-xs">
        <div>
          <span className="text-zinc-500">Monthly payment with {bankName}:</span>
          <div className="text-lg font-bold text-zinc-950 dark:text-white mt-0.5">
            {formatTHB(monthlyPaySatang)} / month
          </div>
        </div>
        <div className="text-right text-emerald-600 font-semibold">
          Total: {formatTHB(totalSatang)}
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-sm shadow-md transition-colors cursor-pointer"
      >
        {isLoading
          ? "Confirming Installment Authorization..."
          : `Confirm 0% ${selectedMonths}-Month Installment`}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>Pre-approved 0% terms under Thai Consumer Credit Regulations</span>
      </div>
    </form>
  );
}
