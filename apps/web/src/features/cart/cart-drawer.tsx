import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag, AlertTriangle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useUIStore } from "@/stores/ui-store";
import { useCartStore } from "@/stores/cart-store";
import { formatTHB, formatMonthlyInstallment } from "@/lib/currency";

export function CartDrawer() {
  const isOpen = useUIStore((state) => state.isCartOpen);
  const setIsOpen = useUIStore((state) => state.setCartOpen);
  const navigate = useNavigate();

  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.subtotalAmount);
  const totalItems = useCartStore((state) => state.totalItems);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const hasOutOfStockItems = items.some((item) => item.available_stock <= 0);

  useEffect(() => {
    if (isOpen) {
      fetchCart();
    }
  }, [isOpen, fetchCart]);

  const handleCheckout = () => {
    setIsOpen(false);
    navigate({ to: "/checkout" });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm"
          />

          {/* Slide-over panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-screen max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col"
              data-lenis-prevent
            >
              {/* Header */}
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-zinc-900 dark:text-white" />
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-white">
                    Review Bag ({totalItems})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-6 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-16 text-zinc-500">
                    <ShoppingBag className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-3 stroke-[1.5]" />
                    <p className="font-semibold text-base text-zinc-900 dark:text-white">
                      Your bag is empty
                    </p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                      Explore our flagship Apple silicon, gaming notebooks, and pro monitors.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        navigate({ to: "/catalog" });
                      }}
                      className="mt-6 px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold text-xs cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      Browse Catalog
                    </button>
                  </div>
                ) : (
                  items.map((item) => {
                    const rawImages = item.images;
                    const thumb =
                      (Array.isArray(rawImages) ? rawImages[0] : typeof rawImages === "string" ? rawImages : "") ||
                      "";
                    const isOutOfStock = item.available_stock <= 0;
                    const isMaxStockReached = item.quantity >= item.available_stock;

                    return (
                      <div key={item.id} className="py-4 first:pt-0 flex gap-4">
                        <div className="w-20 h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 p-2 overflow-hidden">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <ShoppingBag className="w-6 h-6 text-zinc-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1">
                                {item.product_name}
                              </h4>
                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="text-zinc-400 hover:text-rose-500 p-1 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              {item.color_name} • {item.sku}
                            </div>

                            {/* Stock Status Badges */}
                            {isOutOfStock ? (
                              <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Out of Stock — Remove to Proceed</span>
                              </div>
                            ) : isMaxStockReached ? (
                              <div className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                Only {item.available_stock} left in stock
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            {/* Quantity Controls */}
                            <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.id, item.quantity - 1)
                                }
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2.5 text-xs font-semibold text-zinc-900 dark:text-white">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                disabled={isOutOfStock || isMaxStockReached}
                                onClick={() =>
                                  updateQuantity(item.id, item.quantity + 1)
                                }
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <span className="font-bold text-sm text-zinc-950 dark:text-white">
                              {formatTHB(item.price * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer Checkout Summary */}
              {items.length > 0 && (
                <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Subtotal</span>
                      <span className="font-semibold text-zinc-900 dark:text-white">
                        {formatTHB(subtotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Express Courier (Bangkok)</span>
                      <span className="text-emerald-600 font-semibold">Free</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold text-zinc-950 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <span>Estimated Total</span>
                      <span>{formatTHB(subtotal)}</span>
                    </div>
                    <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      0% installment: {formatMonthlyInstallment(subtotal, 10)}
                    </div>
                  </div>

                  {hasOutOfStockItems && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Please remove out-of-stock items before checkout.</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={hasOutOfStockItems}
                    onClick={handleCheckout}
                    className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{hasOutOfStockItems ? "Resolve Unavailable Items" : "Proceed to Checkout"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
