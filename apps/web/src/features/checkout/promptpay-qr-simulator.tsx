import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { formatTHB } from "@/lib/currency";
import type { PromptPayQRResponse } from "@/types/api";

interface PromptPayQRSimulatorProps {
  qrData: PromptPayQRResponse;
  /** Called when the customer says they have paid; resolves once the payment is confirmed. */
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}

/** Thai QR payment: shows the code, then confirms the transfer when the customer has paid. */
export function PromptPayQRSimulator({ qrData, onConfirm, isLoading }: PromptPayQRSimulatorProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(qrData.promptpay_payload, { errorCorrectionLevel: "M", margin: 1, width: 448 })
      .then((url) => live && setQrSrc(url))
      .catch(() => live && setQrSrc(null));
    return () => {
      live = false;
    };
  }, [qrData.promptpay_payload]);

  const handleConfirm = async () => {
    setIsChecking(true);
    try {
      // Give the bank a moment to report the incoming transfer before asking for it.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await onConfirm();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col items-center text-center">
      {/* Thai QR PromptPay Frame */}
      <div className="w-full max-w-xs p-6 rounded-3xl bg-white dark:bg-zinc-900 border-2 border-indigo-600 shadow-xl space-y-4">
        {/* PromptPay Official Style Header */}
        <div className="bg-[#103463] text-white p-2.5 rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2">
          <span>THAI QR PAYMENT</span>
        </div>

        {/* The QR stays dark-on-white in both themes so banking apps can read it */}
        <div className="w-56 h-56 mx-auto bg-white p-2 rounded-2xl flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
          {qrSrc ? (
            <img src={qrSrc} alt={`PromptPay QR code for ${formatTHB(qrData.grand_total_satang)}`} className="w-full h-full object-contain [image-rendering:pixelated]" />
          ) : (
            <QrCode className="w-32 h-32 text-zinc-300 stroke-[1.5] animate-pulse" aria-hidden />
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

      <ol className="w-full max-w-sm space-y-2 text-left text-xs text-zinc-600 dark:text-zinc-300">
        {["Open your banking app and choose Scan QR.", "Scan the code and check the amount matches.", "Confirm the transfer, then tap the button below."].map((step, i) => (
          <li key={step} className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={isLoading || isChecking}
        onClick={handleConfirm}
        className="w-full max-w-sm py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-80 text-white font-bold text-sm shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
      >
        {isLoading || isChecking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Checking with your bank…</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>I've completed the transfer</span>
          </>
        )}
      </button>

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>Instant verification via Bank of Thailand PromptPay Gateway</span>
      </div>
    </div>
  );
}
