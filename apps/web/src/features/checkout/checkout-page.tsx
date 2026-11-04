import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { CreditCard, QrCode, Percent, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api-client";
import type {
  PromptPayQRResponse,
  InstallmentPlanData,
  Order,
} from "@/types/api";
import { formatTHB } from "@/lib/currency";
import { ReservationTimer } from "./reservation-timer";
import { InteractiveCardForm } from "./interactive-card-form";
import { PromptPayQRSimulator } from "./promptpay-qr-simulator";
import { InstallmentCalculator } from "./installment-calculator";

type PaymentTab = "CREDIT_CARD" | "PROMPTPAY_QR" | "INSTALLMENT_0";

export function CheckoutPage() {
  const navigate = useNavigate();
  const cartItems = useCartStore((state) => state.items);
  const cartSubtotal = useCartStore((state) => state.subtotalAmount);
  const user = useAuthStore((state) => state.user);

  // Form states
  const [email, setEmail] = useState(user?.email || "");
  const [recipientName, setRecipientName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [addressLine1, setAddressLine1] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("Bangkok");
  const [postalCode, setPostalCode] = useState("");

  // Reservation & order state
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [grandTotalSatang, setGrandTotalSatang] = useState(cartSubtotal);
  const [isReserving, setIsReserving] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  // Payment tab
  const [activeTab, setActiveTab] = useState<PaymentTab>("PROMPTPAY_QR");
  const [qrData, setQrData] = useState<PromptPayQRResponse | null>(null);

  // Sync email/name if user updates
  useEffect(() => {
    if (user) {
      if (!email) setEmail(user.email);
      if (!recipientName) setRecipientName(user.full_name);
    }
  }, [user]);

  // Step 1: Create atomic reservation hold
  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !recipientName || !addressLine1 || !postalCode) {
      setReserveError("Please fill in all required shipping fields.");
      return;
    }

    setIsReserving(true);
    setReserveError(null);

    try {
      const res = await apiClient<{
        order_number: string;
        reservation_expires_at: string;
        grand_total_satang: number;
        payment_method: string;
      }>("/checkout/reserve", {
        method: "POST",
        body: JSON.stringify({
          customer_email: email,
          shipping_address: {
            recipient_name: recipientName,
            phone,
            address_line_1: addressLine1,
            district,
            province,
            postal_code: postalCode,
          },
          payment_method: activeTab,
        }),
      });

      setActiveOrderNumber(res.data.order_number);
      setReservationExpiresAt(res.data.reservation_expires_at);
      setGrandTotalSatang(res.data.grand_total_satang);

      // Pre-fetch QR code if on PromptPay tab
      loadPromptPayQR(res.data.order_number);
    } catch (err) {
      const msg =
        (err as Error).message ||
        "Failed to lock hardware stock. It may have been reserved by another customer.";
      setReserveError(msg);
    } finally {
      setIsReserving(false);
    }
  };

  const loadPromptPayQR = async (orderNumber: string) => {
    try {
      const res = await apiClient<PromptPayQRResponse>(
        `/checkout/promptpay/${orderNumber}`
      );
      setQrData(res.data);
    } catch {
      // Fallback format
    }
  };

  // Step 2: Payment execution handlers
  const handleCardPayment = async (cardData: {
    cardNumber: string;
    cardHolder: string;
    cardExpiry: string;
    cardCVV: string;
  }) => {
    if (!activeOrderNumber) return;
    setIsPaying(true);
    setCardError(null);

    try {
      await apiClient<Order>("/checkout/pay", {
        method: "POST",
        body: JSON.stringify({
          order_number: activeOrderNumber,
          payment_method: "CREDIT_CARD",
          card_number: cardData.cardNumber,
          card_holder_name: cardData.cardHolder,
          card_expiry: cardData.cardExpiry,
          card_cvv: cardData.cardCVV,
        }),
      });

      navigate({
        to: "/orders/$orderNumber",
        params: { orderNumber: activeOrderNumber },
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "CARD_DECLINED_INSUFFICIENT_FUNDS") {
        setCardError(
          "Your bank declined this transaction (Simulation code 0000). Your 15-minute stock hold is still active."
        );
      } else {
        setCardError((err as Error).message || "Payment authorization failed");
      }
    } finally {
      setIsPaying(false);
    }
  };

  const handlePromptPaySuccess = async () => {
    if (!activeOrderNumber) return;
    setIsPaying(true);

    try {
      await apiClient<Order>("/checkout/pay", {
        method: "POST",
        body: JSON.stringify({
          order_number: activeOrderNumber,
          payment_method: "PROMPTPAY_QR",
        }),
      });

      navigate({
        to: "/orders/$orderNumber",
        params: { orderNumber: activeOrderNumber },
      });
    } catch (err) {
      setReserveError((err as Error).message);
    } finally {
      setIsPaying(false);
    }
  };

  const handleInstallmentPayment = async (plan: InstallmentPlanData) => {
    if (!activeOrderNumber) return;
    setIsPaying(true);

    try {
      await apiClient<Order>("/checkout/pay", {
        method: "POST",
        body: JSON.stringify({
          order_number: activeOrderNumber,
          payment_method: "INSTALLMENT_0",
          installment_plan: plan,
        }),
      });

      navigate({
        to: "/orders/$orderNumber",
        params: { orderNumber: activeOrderNumber },
      });
    } catch (err) {
      setReserveError((err as Error).message);
    } finally {
      setIsPaying(false);
    }
  };

  if (cartItems.length === 0 && !activeOrderNumber) {
    return (
      <div className="py-32 max-w-lg mx-auto text-center px-4">
        <h2 className="text-2xl font-bold text-zinc-950 dark:text-white">
          Your Bag is Empty
        </h2>
        <p className="text-xs text-zinc-500 mt-2">
          There are no items reserved in your shopping cart.
        </p>
        <Link
          to="/catalog"
          className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-semibold"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          to="/catalog"
          className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
            Secure Checkout
          </h1>
          <p className="text-xs text-zinc-500">
            256-Bit SSL Encrypted Hardware Allocation
          </p>
        </div>
      </div>

      {/* Reservation 15:00 Timer Banner */}
      {reservationExpiresAt && (
        <div className="mb-8">
          <ReservationTimer
            expiresAt={reservationExpiresAt}
            onExpired={() => {
              setActiveOrderNumber(null);
              setReserveError(
                "Your 15-minute stock hold has expired. Please re-initiate checkout."
              );
            }}
          />
        </div>
      )}

      {/* Error Callout */}
      {reserveError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{reserveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Form: Shipping Details or Active Payment */}
        <div className="lg:col-span-7 space-y-8">
          {!activeOrderNumber ? (
            /* Step 1: Shipping Address Form */
            <form
              onSubmit={handleCreateReservation}
              className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-5 shadow-xs"
            >
              <h2 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                1. Delivery Details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Customer Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="somchai@company.co.th"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Recipient Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Somchai Prommin"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Mobile Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="081-234-5678"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Street Address & Building
                </label>
                <input
                  type="text"
                  required
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="88/12 Sukhumvit Soi 55, Thonglor"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    District
                  </label>
                  <input
                    type="text"
                    required
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Watthana"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Province
                  </label>
                  <input
                    type="text"
                    required
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="10110"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isReserving}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-sm shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isReserving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Locking Hardware Allocation (15m)...</span>
                  </>
                ) : (
                  <span>Lock Stock & Proceed to Payment</span>
                )}
              </button>
            </form>
          ) : (
            /* Step 2: Payment Methods Tab */
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                  2. Payment Method
                </h2>
                <span className="text-xs font-mono text-zinc-500">
                  Ref: {activeOrderNumber}
                </span>
              </div>

              {/* Payment Tabs Selector */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("PROMPTPAY_QR");
                    if (activeOrderNumber) loadPromptPayQR(activeOrderNumber);
                  }}
                  className={`py-3 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "PROMPTPAY_QR"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>PromptPay QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("CREDIT_CARD")}
                  className={`py-3 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "CREDIT_CARD"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Credit Card</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("INSTALLMENT_0")}
                  className={`py-3 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "INSTALLMENT_0"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                  }`}
                >
                  <Percent className="w-4 h-4" />
                  <span>0% Installment</span>
                </button>
              </div>

              {/* Tab Contents */}
              <div className="pt-2">
                {activeTab === "PROMPTPAY_QR" && (
                  qrData ? (
                    <PromptPayQRSimulator
                      qrData={qrData}
                      onSimulateSuccess={handlePromptPaySuccess}
                      isLoading={isPaying}
                    />
                  ) : (
                    <div className="py-12 flex justify-center text-zinc-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )
                )}

                {activeTab === "CREDIT_CARD" && (
                  <InteractiveCardForm
                    onPay={handleCardPayment}
                    isLoading={isPaying}
                    errorMessage={cardError}
                  />
                )}

                {activeTab === "INSTALLMENT_0" && (
                  <InstallmentCalculator
                    totalSatang={grandTotalSatang}
                    onPay={handleInstallmentPayment}
                    isLoading={isPaying}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Summary: Items & Price */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-900 dark:text-white">
              Order Summary
            </h3>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80 max-h-80 overflow-y-auto">
              {cartItems.map((item) => (
                <div key={item.id} className="py-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                    <img
                      src={
                        (Array.isArray(item.images) && item.images[0]) || ""
                      }
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                      {item.product_name}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Qty: {item.quantity} • {item.color_name}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-zinc-950 dark:text-white">
                    {formatTHB(item.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>Subtotal</span>
                <span>{formatTHB(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Express Courier Shipping</span>
                <span className="text-emerald-600 font-semibold">Free</span>
              </div>
              <div className="flex justify-between text-base font-black text-zinc-950 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <span>Grand Total</span>
                <span>{formatTHB(cartSubtotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
