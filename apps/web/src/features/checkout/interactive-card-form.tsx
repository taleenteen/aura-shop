import React, { useState } from "react";
import { motion } from "motion/react";
import { CreditCard, Lock, AlertCircle } from "lucide-react";

interface InteractiveCardFormProps {
  onPay: (cardData: {
    cardNumber: string;
    cardHolder: string;
    cardExpiry: string;
    cardCVV: string;
  }) => Promise<void>;
  isLoading: boolean;
  errorMessage?: string | null;
}

export function InteractiveCardForm({
  onPay,
  isLoading,
  errorMessage,
}: InteractiveCardFormProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);

  // Card brand detection
  const cleanNumber = cardNumber.replace(/\s+/g, "");
  const cardBrand = cleanNumber.startsWith("4")
    ? "VISA"
    : cleanNumber.startsWith("5")
      ? "MASTERCARD"
      : "CARD";

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = raw.match(/.{1,4}/g)?.join(" ") || raw;
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 2) {
      setCardExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`);
    } else {
      setCardExpiry(raw);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanNumber || cleanNumber.length < 16) return;
    onPay({
      cardNumber: cleanNumber,
      cardHolder,
      cardExpiry,
      cardCVV,
    });
  };

  return (
    <div className="space-y-6">
      {/* 3D Card Preview Container */}
      <div className="w-full max-w-sm mx-auto h-48 [perspective:1000px]">
        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="relative w-full h-full rounded-2xl p-6 text-white shadow-xl [transform-style:preserve-3d] bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 border border-zinc-700/60"
        >
          {/* Front Face */}
          <div className="absolute inset-0 p-6 flex flex-col justify-between [backface-visibility:hidden]">
            <div className="flex items-center justify-between">
              <div className="w-10 h-7 rounded-md bg-amber-400/80 border border-amber-300 shadow-xs flex items-center justify-center">
                <div className="w-7 h-4 border-t border-b border-amber-600/50" />
              </div>
              <div className="font-mono font-bold text-xs tracking-wider uppercase">
                {cardBrand}
              </div>
            </div>

            <div className="font-mono text-lg tracking-widest text-center text-zinc-100">
              {cardNumber || "•••• •••• •••• ••••"}
            </div>

            <div className="flex items-end justify-between text-xs">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-400">
                  Cardholder
                </div>
                <div className="font-semibold uppercase tracking-wider truncate max-w-[160px]">
                  {cardHolder || "FULL NAME"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-zinc-400">
                  Expires
                </div>
                <div className="font-mono font-semibold">
                  {cardExpiry || "MM/YY"}
                </div>
              </div>
            </div>
          </div>

          {/* Back Face (Magnetic Strip & CVV) */}
          <div className="absolute inset-0 rounded-2xl [transform:rotateY(180deg)] [backface-visibility:hidden] flex flex-col justify-between py-6">
            <div className="w-full h-10 bg-zinc-950 mt-2" />
            <div className="px-6">
              <div className="text-[9px] uppercase tracking-wider text-zinc-400 mb-1 text-right">
                CVV / CVC
              </div>
              <div className="w-full h-8 bg-zinc-200 text-zinc-950 font-mono font-bold text-sm flex items-center justify-end px-3 rounded">
                {cardCVV || "•••"}
              </div>
            </div>
            <div className="text-[9px] text-zinc-500 text-center px-6">
              256-bit encrypted simulation. Never enter real card credentials.
            </div>
          </div>
        </motion.div>
      </div>

      {/* Simulator Guidance Alert */}
      <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300">
        💡 <strong className="text-zinc-900 dark:text-white">Developer Simulation Tip:</strong> Enter card number ending in{" "}
        <span className="font-mono font-bold text-rose-500">0000</span> to test bank decline simulation without losing your 15-minute stock hold.
      </div>

      {/* Decline Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Inputs Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Card Number
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={cardNumber}
              onChange={handleNumberChange}
              onFocus={() => setIsFlipped(false)}
              placeholder="4532 1111 2222 0000"
              className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white"
            />
            <CreditCard className="w-4 h-4 text-zinc-400 absolute left-3 top-3.5" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Name on Card
          </label>
          <input
            type="text"
            required
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value)}
            onFocus={() => setIsFlipped(false)}
            placeholder="SOMCHAI PROMMIN"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white uppercase outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Expiration (MM/YY)
            </label>
            <input
              type="text"
              required
              value={cardExpiry}
              onChange={handleExpiryChange}
              onFocus={() => setIsFlipped(false)}
              placeholder="12/28"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Security CVV / CVC
            </label>
            <div className="relative">
              <input
                type="password"
                required
                maxLength={4}
                value={cardCVV}
                onChange={(e) => setCardCVV(e.target.value.replace(/\D/g, ""))}
                onFocus={() => setIsFlipped(true)}
                onBlur={() => setIsFlipped(false)}
                placeholder="123"
                className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white"
              />
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3.5" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || cleanNumber.length < 16}
          className="w-full mt-4 py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-sm shadow-md transition-colors cursor-pointer disabled:opacity-50"
        >
          {isLoading ? "Processing Gateway Transaction..." : "Complete Card Payment"}
        </button>
      </form>
    </div>
  );
}
