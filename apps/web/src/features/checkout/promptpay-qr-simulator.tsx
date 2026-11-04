import { useState } from "react";
import { QrCode, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { formatTHB } from "@/lib/currency";
import type { PromptPayQRResponse } from "@/types/api";

interface PromptPayQRSimulatorProps {
  qrData: PromptPayQRResponse;
  onSimulateSuccess: () => Promise<void>;
  isLoading: boolean;
}

export function PromptPayQRSimulator({
  qrData,
  onSimulateSuccess,
  isLoading,
}: PromptPayQRSimulatorProps) {
  const [hasScanned, setHasScanned] = useState(false);

  const handleSimulate = async () => {
    setHasScanned(true);
    await onSimulateSuccess();
  };

  return (
    <div className="space-y-6 flex flex-col items-center text-center">
      {/* Thai QR PromptPay Frame */}
      <div className="w-full max-w-xs p-6 rounded-3xl bg-white dark:bg-zinc-900 border-2 border-indigo-600 shadow-xl space-y-4">
        {/* PromptPay Official Style Header */}
        <div className="bg-[#103463] text-white p-2.5 rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2">
          <span>THAI QR PAYMENT</span>
        </div>

        {/* Dynamic QR SVG */}
        <div className="w-56 h-56 mx-auto bg-zinc-50 dark:bg-zinc-800 p-2 rounded-2xl flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
          {qrData.qr_code_data_url ? (
            <img
              src={qrData.qr_code_data_url}
              alt="PromptPay QR Code"
              className="w-full h-full object-contain"
            />
          ) : (
            <QrCode className="w-32 h-32 text-zinc-900 dark:text-white stroke-[1.5]" />
          )}
        </div>

        <div>
          <div className="text-xs text-zinc-500">Scan to pay exact amount:</div>
          <div className="text-xl font-black text-zinc-950 dark:text-white mt-0.5">
            {formatTHB(qrData.grand_total_satang)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            Order Ref: {qrData.order_number}
          </div>
        </div>
      </div>

      {/* Developer Webhook Simulator Action Bar */}
      <div className="w-full max-w-sm p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-white">
          <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
          <span>Developer Payment Simulator Bar</span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 text-left leading-relaxed">
          In a production environment, your banking app webhook notifies the gateway. Click below to simulate an instant webhook callback confirmation:
        </p>

        <button
          type="button"
          disabled={isLoading}
          onClick={handleSimulate}
          className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {hasScanned || isLoading ? (
            <>
              <CheckCircle2 className="w-4 h-4 animate-spin" />
              <span>Confirming Bank Transfer...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Simulate Customer Scan Success</span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>Instant verification via Bank of Thailand PromptPay Gateway</span>
      </div>
    </div>
  );
}
