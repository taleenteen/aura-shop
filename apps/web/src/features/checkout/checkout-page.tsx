import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { CreditCard, QrCode, Percent, ArrowLeft, Loader2, AlertCircle, MapPin } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import { z } from "zod";
import { validate, email as emailRule, requiredText, type FieldErrors } from "@/lib/validation";
import type { PromptPayQRResponse, InstallmentPlanData, Order, PaymentMethod, User } from "@/types/api";
import { formatTHB } from "@/lib/currency";
import { isPayable } from "@/features/orders/order-status";
import { CancelOrderButton, cancelOrder } from "@/features/orders/cancel-order-button";
import { ReservationTimer } from "./reservation-timer";
import { InteractiveCardForm } from "./interactive-card-form";
import { PromptPayQRSimulator } from "./promptpay-qr-simulator";
import { InstallmentCalculator } from "./installment-calculator";

type PaymentTab = PaymentMethod;

/** One row of the Order Summary, from the bag before payment or from the order while paying. */
interface SummaryLine {
  id: string;
  name: string;
  detail: string;
  quantity: number;
  total: number;
  image?: string;
}

const POSTAL_CODE = /\b\d{5}\b/;

const contactSchema = z.object({
  customer_email: emailRule(),
  recipient_name: requiredText("the recipient's name", 100),
  phone: z
    .string()
    .trim()
    .min(1, "Enter a phone number for the courier.")
    .max(30, "Keep the phone number under 30 characters.")
    .regex(/^[0-9+\-\s()]*$/, "Use digits only, e.g. 081-234-5678."),
});

const deliverySchema = contactSchema.extend({
  address_line_1: requiredText("the street address", 200),
  district: requiredText("the district", 100),
  province: requiredText("the province", 100),
  postal_code: z.string().trim().regex(/^\d{5}$/, "Postal codes have 5 digits."),
});

export function CheckoutPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const resumeNumber = typeof search.order === "string" ? search.order : null;
  const cartItems = useCartStore((state) => state.items);
  const cartSubtotal = useCartStore((state) => state.subtotalAmount);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  // Delivery details. Signed-in customers start from their profile.
  const savedAddress = user?.address?.trim() ?? "";
  const [email, setEmail] = useState(user?.email || "");
  const [recipientName, setRecipientName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [useSavedAddress, setUseSavedAddress] = useState(!!savedAddress);
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [addressLine1, setAddressLine1] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("Bangkok");
  const [postalCode, setPostalCode] = useState("");

  // Reservation & order state
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [grandTotalSatang, setGrandTotalSatang] = useState(cartSubtotal);
  const [isReserving, setIsReserving] = useState(false);
  const [isResuming, setIsResuming] = useState(!!resumeNumber);
  const [isPaying, setIsPaying] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fieldError = (key: string) => fieldErrors[key] && <p className="mt-1 text-[11px] text-rose-600">{fieldErrors[key]}</p>;
  // Locking stock turns the bag into an order and empties it on the server. Keep the lines for
  // the Order Summary while paying, and refresh the cart so the navbar shows it empty.
  const [lockedLines, setLockedLines] = useState<SummaryLine[] | null>(null);
  const cartLines: SummaryLine[] = cartItems.map((item) => ({
    id: item.id,
    name: item.product_name,
    detail: item.color_name,
    quantity: item.quantity,
    total: item.price * item.quantity,
    image: Array.isArray(item.images) ? item.images[0] : undefined,
  }));
  const summaryLines = lockedLines ?? cartLines;
  const summarySubtotal = lockedLines ? grandTotalSatang : cartSubtotal;

  // Payment tab
  const [activeTab, setActiveTab] = useState<PaymentTab>("PROMPTPAY_QR");
  const [qrData, setQrData] = useState<PromptPayQRResponse | null>(null);

  // The profile can finish loading after this page mounts.
  useEffect(() => {
    if (!user) return;
    setEmail((v) => v || user.email);
    setRecipientName((v) => v || user.full_name);
    setPhone((v) => v || user.phone || "");
    setUseSavedAddress(!!user.address?.trim());
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPromptPayQR = async (orderNumber: string) => {
    try {
      const res = await apiClient<PromptPayQRResponse>(`/checkout/promptpay/${orderNumber}`);
      setQrData(res.data);
    } catch {
      // The tab shows a spinner until the code loads; switching tabs retries.
    }
  };

  const beginPayment = (orderNumber: string, expiresAt: string, total: number, lines: SummaryLine[], method: PaymentTab) => {
    setLockedLines(lines);
    setActiveOrderNumber(orderNumber);
    setReservationExpiresAt(expiresAt);
    setGrandTotalSatang(total);
    setActiveTab(method);
    loadPromptPayQR(orderNumber);
  };

  // /checkout?order=N continues paying for an order placed earlier (from My Orders, the order
  // page, or a reload of this page). Orders that can no longer be paid open their order page.
  useEffect(() => {
    if (!resumeNumber || resumeNumber === activeOrderNumber) {
      setIsResuming(false);
      return;
    }
    setIsResuming(true);
    apiClient<Order>(`/orders/${resumeNumber}`)
      .then(({ data: order }) => {
        if (!order.viewer_can_manage || !isPayable(order)) {
          navigate({ to: "/orders/$orderNumber", params: { orderNumber: order.order_number }, replace: true });
          return;
        }
        beginPayment(
          order.order_number,
          order.reservation_expires_at,
          order.grand_total,
          (order.items ?? []).map((i) => ({
            id: i.id,
            name: i.name_snapshot,
            detail: i.spec_summary,
            quantity: i.quantity,
            total: i.unit_price * i.quantity,
          })),
          order.payment_method
        );
      })
      .catch(() => setReserveError("We couldn't find that order. It may have been placed from another browser."))
      .finally(() => setIsResuming(false));
  }, [resumeNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1: Create atomic reservation hold
  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const deliverToSaved = useSavedAddress && !!savedAddress;
    const checked = deliverToSaved
      ? validate(contactSchema, { customer_email: email, recipient_name: recipientName, phone })
      : validate(deliverySchema, {
          customer_email: email,
          recipient_name: recipientName,
          phone,
          address_line_1: addressLine1,
          district,
          province,
          postal_code: postalCode,
        });
    setFieldErrors(checked.ok ? {} : checked.fields);
    if (!checked.ok) {
      setReserveError("Please check the highlighted delivery fields.");
      return;
    }

    setIsReserving(true);
    setReserveError(null);

    const { customer_email: customerEmail, ...contact } = checked.data;
    const shippingAddress = deliverToSaved
      ? {
          ...contact,
          address_line_1: savedAddress,
          district: "",
          province: "",
          postal_code: savedAddress.match(POSTAL_CODE)?.[0] ?? "",
        }
      : contact;

    try {
      const res = await apiClient<{
        order_number: string;
        reservation_expires_at: string;
        grand_total_satang: number;
        payment_method: PaymentTab;
      }>("/checkout/reserve", {
        method: "POST",
        body: JSON.stringify({ customer_email: customerEmail, shipping_address: shippingAddress, payment_method: activeTab }),
      });

      beginPayment(res.data.order_number, res.data.reservation_expires_at, res.data.grand_total_satang, cartLines, activeTab);
      // Keep the order in the URL so a reload continues the payment instead of losing it.
      navigate({ to: "/checkout", search: { order: res.data.order_number }, replace: true });
      fetchCart();

      if (user && !deliverToSaved && saveToProfile) {
        const address = [addressLine1, district, province, postalCode].filter(Boolean).join(", ");
        apiClient<User>("/auth/me", {
          method: "PATCH",
          body: JSON.stringify({ full_name: user.full_name, phone, address }),
        })
          .then((r) => setUser({ ...user, ...r.data }))
          .catch(() => {});
      }
    } catch (err) {
      const apiErr = err as ApiRequestError;
      if (apiErr.fields) setFieldErrors(apiErr.fields);
      setReserveError(apiErr.message || "We couldn't hold these items. Someone may have just bought the last one.");
    } finally {
      setIsReserving(false);
    }
  };

  const goToOrder = (orderNumber: string) => navigate({ to: "/orders/$orderNumber", params: { orderNumber }, replace: true });

  // When the 15-minute hold runs out, release it right away so the items return to the bag,
  // then show the order page, which explains what happened.
  const expiredRef = useRef(false);
  const handleExpired = useCallback(async () => {
    if (expiredRef.current || !activeOrderNumber) return;
    expiredRef.current = true;
    const orderNumber = activeOrderNumber;
    try {
      await cancelOrder(orderNumber);
    } catch {
      // Already released by the server; the bag was restored there.
      await fetchCart();
    }
    goToOrder(orderNumber);
  }, [activeOrderNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async (body: Record<string, unknown>, onError: (err: Error & { code?: string }) => void) => {
    if (!activeOrderNumber) return;
    setIsPaying(true);
    try {
      await apiClient<Order>("/checkout/pay", {
        method: "POST",
        body: JSON.stringify({ order_number: activeOrderNumber, ...body }),
      });
      goToOrder(activeOrderNumber);
    } catch (err) {
      onError(err as Error & { code?: string });
    } finally {
      setIsPaying(false);
    }
  };

  // Step 2: Payment execution handlers
  const handleCardPayment = (cardData: { cardNumber: string; cardHolder: string; cardExpiry: string; cardCVV: string }) => {
    setCardError(null);
    return pay(
      {
        payment_method: "CREDIT_CARD",
        card_number: cardData.cardNumber,
        card_holder_name: cardData.cardHolder,
        card_expiry: cardData.cardExpiry,
        card_cvv: cardData.cardCVV,
      },
      (err) =>
        setCardError(
          err.code === "CARD_DECLINED_INSUFFICIENT_FUNDS"
            ? "Your bank declined this card. Your items are still held; try another card or pay with PromptPay."
            : err.message || "We couldn't authorize this payment. Please try again."
        )
    );
  };

  const handlePromptPaySuccess = () =>
    pay({ payment_method: "PROMPTPAY_QR" }, (err) => setReserveError(err.message || "We couldn't confirm your transfer yet."));

  const handleInstallmentPayment = (plan: InstallmentPlanData) =>
    pay({ payment_method: "INSTALLMENT_0", installment_plan: plan }, (err) => setReserveError(err.message));

  if (isResuming) {
    return (
      <div className="py-40 flex justify-center text-zinc-400">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  if (cartItems.length === 0 && !activeOrderNumber) {
    return (
      <div className="py-32 max-w-lg mx-auto text-center px-4">
        <h2 className="text-2xl font-bold text-zinc-950 dark:text-white">Your Bag is Empty</h2>
        <p className="text-xs text-zinc-500 mt-2">{reserveError ?? "There are no items in your bag yet."}</p>
        <Link
          to="/catalog"
          className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-semibold"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  const input =
    "w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white";
  const label = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1";
  const deliverToSaved = useSavedAddress && !!savedAddress;

  const tabButton = (tab: PaymentTab, icon: React.ReactNode, text: string) => (
    <button
      type="button"
      onClick={() => {
        setActiveTab(tab);
        if (tab === "PROMPTPAY_QR" && activeOrderNumber && !qrData) loadPromptPayQR(activeOrderNumber);
      }}
      className={`py-3 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
        activeTab === tab
          ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm"
          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
      }`}
    >
      {icon}
      <span>{text}</span>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          to="/catalog"
          aria-label="Back to catalog"
          className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white">Secure Checkout</h1>
          <p className="text-xs text-zinc-500">256-Bit SSL Encrypted Hardware Allocation</p>
        </div>
      </div>

      {/* Reservation 15:00 Timer Banner */}
      {reservationExpiresAt && (
        <div className="mb-8">
          <ReservationTimer expiresAt={reservationExpiresAt} onExpired={handleExpired} />
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
            /* Step 1: Delivery details */
            <form
              onSubmit={handleCreateReservation}
              noValidate
              className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-5 shadow-xs"
            >
              <h2 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider">1. Delivery Details</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="checkout-email" className={label}>Customer Email</label>
                  <input id="checkout-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="somchai@company.co.th" autoComplete="email" className={input} />
                  {fieldError("customer_email")}
                </div>
                <div>
                  <label htmlFor="checkout-name" className={label}>Recipient Full Name</label>
                  <input id="checkout-name" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Somchai Prommin" autoComplete="name" className={input} />
                  {fieldError("recipient_name")}
                </div>
              </div>

              <div>
                <label htmlFor="checkout-phone" className={label}>Mobile Phone Number</label>
                <input id="checkout-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="081-234-5678" autoComplete="tel" className={input} />
                  {fieldError("phone")}
              </div>

              {savedAddress && (
                <fieldset className="space-y-2">
                  <legend className={label}>Deliver to</legend>
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                      deliverToSaved ? "border-zinc-950 dark:border-white bg-zinc-50 dark:bg-zinc-800/60" : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <input type="radio" name="address-choice" checked={deliverToSaved} onChange={() => setUseSavedAddress(true)} className="mt-0.5 accent-zinc-950" />
                    <span className="min-w-0 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
                        <MapPin className="w-3.5 h-3.5" aria-hidden />
                        My saved address
                      </span>
                      <span className="block mt-0.5 text-zinc-500 whitespace-pre-line break-words">{savedAddress}</span>
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                      !deliverToSaved ? "border-zinc-950 dark:border-white bg-zinc-50 dark:bg-zinc-800/60" : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <input type="radio" name="address-choice" checked={!deliverToSaved} onChange={() => setUseSavedAddress(false)} className="accent-zinc-950" />
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">A different address</span>
                  </label>
                </fieldset>
              )}

              {!deliverToSaved && (
                <>
                  <div>
                    <label htmlFor="checkout-address" className={label}>Street Address & Building</label>
                    <input id="checkout-address" type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="88/12 Sukhumvit Soi 55, Thonglor" autoComplete="street-address" className={input} />
                  {fieldError("address_line_1")}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="checkout-district" className={label}>District</label>
                      <input id="checkout-district" type="text" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Watthana" className={input} />
                  {fieldError("district")}
                    </div>
                    <div>
                      <label htmlFor="checkout-province" className={label}>Province</label>
                      <input id="checkout-province" type="text" value={province} onChange={(e) => setProvince(e.target.value)} autoComplete="address-level1" className={input} />
                  {fieldError("province")}
                    </div>
                    <div>
                      <label htmlFor="checkout-postal" className={label}>Postal Code</label>
                      <input id="checkout-postal" type="text" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="10110" autoComplete="postal-code" className={input} />
                  {fieldError("postal_code")}
                    </div>
                  </div>

                  {user && (
                    <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={saveToProfile} onChange={(e) => setSaveToProfile(e.target.checked)} className="accent-zinc-950" />
                      {savedAddress ? "Replace my saved address with this one" : "Save this address to my profile"}
                    </label>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={isReserving}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-sm shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isReserving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Holding your items…</span>
                  </>
                ) : (
                  <span>Continue to Payment</span>
                )}
              </button>
            </form>
          ) : (
            /* Step 2: Payment Methods Tab */
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider">2. Payment Method</h2>
                <span className="text-xs font-mono text-zinc-500">Ref: {activeOrderNumber}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {tabButton("PROMPTPAY_QR", <QrCode className="w-4 h-4" />, "PromptPay QR")}
                {tabButton("CREDIT_CARD", <CreditCard className="w-4 h-4" />, "Credit Card")}
                {tabButton("INSTALLMENT_0", <Percent className="w-4 h-4" />, "0% Installment")}
              </div>

              <div className="pt-2">
                {activeTab === "PROMPTPAY_QR" &&
                  (qrData ? (
                    <PromptPayQRSimulator qrData={qrData} onConfirm={handlePromptPaySuccess} isLoading={isPaying} />
                  ) : (
                    <div className="py-12 flex justify-center text-zinc-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ))}

                {activeTab === "CREDIT_CARD" && (
                  <InteractiveCardForm onPay={handleCardPayment} isLoading={isPaying} errorMessage={cardError} />
                )}

                {activeTab === "INSTALLMENT_0" && (
                  <InstallmentCalculator totalSatang={grandTotalSatang} onPay={handleInstallmentPayment} isLoading={isPaying} />
                )}
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-500">Changed your mind? Cancelling puts the items back in your bag.</p>
                <CancelOrderButton orderNumber={activeOrderNumber} onCancelled={() => goToOrder(activeOrderNumber)} />
              </div>
            </div>
          )}
        </div>

        {/* Right Summary: Items & Price */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-900 dark:text-white">Order Summary</h3>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80 max-h-80 overflow-y-auto">
              {summaryLines.map((line) => (
                <div key={line.id} className="py-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                    {line.image && <img src={line.image} alt="" className="max-h-full max-w-full object-contain" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">{line.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      Qty: {line.quantity} • {line.detail}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-zinc-950 dark:text-white">{formatTHB(line.total)}</div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>Subtotal</span>
                <span>{formatTHB(summarySubtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Express Courier Shipping</span>
                <span className="text-emerald-600 font-semibold">Free</span>
              </div>
              <div className="flex justify-between text-base font-black text-zinc-950 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <span>Grand Total</span>
                <span>{formatTHB(summarySubtotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
