// ========================================================
// AURA TECH — Shared TypeScript Data Contracts
// All monetary values in Satang (int64) e.g., 5990000 = ฿59,900.00
// All JSON keys match Go structs 1:1 in snake_case
// ========================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta: ApiMeta | null;
  error: ApiError | null;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total_items?: number;
  total_pages?: number;
  facets?: FacetCounts;
}

export interface ApiError {
  code: string;
  message: string;
  /** Per-field problems, keyed by input path such as "variants.0.sku". */
  fields?: Record<string, string>;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  /** Free-text delivery address saved on the profile. */
  address: string;
  role: "CUSTOMER" | "ADMIN";
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon_name: string;
  sort_order: number;
}

export interface Brand {
  id: string;
  slug: string;
  name: string;
  logo_url: string;
}

export type BannerPlacement = "HERO_SPLIT" | "BENTO_GRID" | "TOP_RIBBON";
export type BannerThemeMode = "DARK" | "LIGHT";

export interface Banner {
  id: string;
  placement: BannerPlacement;
  grid_span: string;
  theme_mode: BannerThemeMode;
  background_color: string;
  badge_text: string;
  headline: string;
  subheadline: string;
  product_image_url: string;
  cta_primary_text: string;
  cta_primary_link: string;
  cta_secondary_text: string;
  cta_secondary_link: string;
  sort_order: number;
  is_active: boolean;
  start_at: string;
  end_at: string;
  created_at: string;
}

export interface VariantSpecs {
  cpu_family: string;
  cpu_detail: string;
  ram_gb: number;
  storage_gb: number;
  screen_size_inch: number;
  panel_type: string;
  refresh_rate_hz: number;
  weight_kg: number;
  has_thunderbolt: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  color_name: string;
  color_hex: string;
  price: number; // Satang
  compare_price?: number; // Satang
  stock_quantity: number;
  reserved_stock: number;
  specs: VariantSpecs;
  images: string[];
}

export interface BentoHighlightItem {
  id: string;
  span: "col-span-1" | "col-span-2";
  icon: string;
  eyebrow: string;
  big_metric: string;
  title: string;
  description: string;
}

export interface PortItem {
  name: string;
  spec: string;
}

export interface PortsDiagramData {
  left_ports: PortItem[];
  right_ports: PortItem[];
}

export interface BoxContentItem {
  name: string;
  icon: string;
}

export interface SpecCategoryGroup {
  category: string;
  rows: Array<{ label: string; value: string }>;
}

export interface ProductAccessoryBundle {
  id: string;
  main_product_id: string;
  accessory_product_id: string;
  accessory_product?: Product;
  bundle_discount_pct: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  category?: Category;
  brand_id: string;
  brand?: Brand;
  tagline: string;
  short_description: string;
  base_price: number; // Lowest variant price in Satang
  usage_personas: string[]; // ["CREATOR", "GAMING", "ULTRALIGHT", "OFFICE"]
  bento_highlights: BentoHighlightItem[];
  box_contents: BoxContentItem[];
  ports_diagram: PortsDiagramData;
  full_spec_matrix: SpecCategoryGroup[];
  is_active: boolean;
  variants: ProductVariant[];
  accessory_bundles?: ProductAccessoryBundle[];
  created_at: string;
  updated_at: string;
}

export interface Wishlist {
  id: string;
  user_id?: string | null;
  guest_session_id?: string | null;
  product_id: string;
  product: Product;
  created_at: string;
}

export interface CartItem {
  id: string;
  user_id?: string | null;
  guest_session_id?: string | null;
  variant_id: string;
  variant: ProductVariant;
  quantity: number;
  updated_at: string;
}

export interface CartItemDTO {
  id: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  sku: string;
  color_name: string;
  color_hex: string;
  price: number;
  quantity: number;
  available_stock: number;
  specs: VariantSpecs;
  images: string[];
  item_total: number;
}

export interface CartResponse {
  items: CartItemDTO[];
  total_items: number;
  subtotal_amount: number;
}

export interface WishlistToggleResponse {
  liked: boolean;
  total_count: number;
}

export interface StockReservation {
  id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  expires_at: string;
  status: "ACTIVE" | "COMMITTED" | "RELEASED";
}

export interface ShippingAddress {
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  district: string;
  province: string;
  postal_code: string;
}

export interface InstallmentPlanData {
  bank_code: "KBANK" | "SCB" | "KRUNGSRI" | "BBL";
  bank_name: string;
  months: 3 | 6 | 10;
  interest_rate: 0;
  monthly_pay_satang: number;
}

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID_PROCESSING"
  | "SN_ASSIGNED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentMethod = "PROMPTPAY_QR" | "CREDIT_CARD" | "INSTALLMENT_0";

export interface OrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  sku_snapshot: string;
  name_snapshot: string;
  spec_summary: string;
  unit_price: number; // Satang
  quantity: number;
  /** One warranty serial per unit; index i is unit i+1. */
  serial_numbers: string[] | null;
}

export interface Order {
  id: string;
  order_number: string;
  user_id?: string | null;
  guest_session_id?: string | null;
  customer_email: string;
  status: OrderStatus;
  subtotal_amount: number; // Satang
  discount_amount: number; // Satang
  grand_total: number; // Satang
  shipping_address: ShippingAddress;
  payment_method: PaymentMethod;
  installment_plan?: InstallmentPlanData | null;
  reservation_expires_at: string;
  items: OrderItem[];
  /** Statuses an admin may move this order to. Present on admin listings; absent means none. */
  allowed_transitions?: OrderStatus[];
  /** True when this browser or account placed the order and may pay for or cancel it. */
  viewer_can_manage?: boolean;
  /** Carrier code (KERRY, FLASH, DHL) and tracking number, set when the order ships. */
  carrier?: Carrier | "";
  tracking_number?: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  disabled: boolean;
}

export interface FacetCounts {
  personas: FacetOption[];
  brands: FacetOption[];
  cpu_family: FacetOption[];
  ram: FacetOption[];
  storage: FacetOption[];
  price_range: {
    min_satang: number;
    max_satang: number;
  };
}

export interface InstallmentCalculationOption {
  bank_code: string;
  bank_name: string;
  months: number;
  interest_rate: number;
  monthly_pay_satang: number;
}

export interface PromptPayQRResponse {
  order_number: string;
  grand_total_satang: number;
  promptpay_payload: string;
}

export interface LowStockItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  color_name: string;
  stock_quantity: number;
  reserved_stock: number;
  available_stock: number;
}

/** Computed from orders; "paid" excludes PENDING_PAYMENT and CANCELLED. Amounts in satang. */
export interface AdminOverviewStats {
  total_revenue_satang: number;
  paid_orders_count: number;
  total_orders_count: number;
  orders_by_status: Record<string, number>;
  revenue_30d_satang: number;
  revenue_prev_30d_satang: number;
  /** Last 7 days (Bangkok time), oldest first, zero-filled. */
  daily_revenue: { date: string; revenue_satang: number; orders: number }[];
  /** Paid line-item revenue per category, largest first. */
  category_revenue: { category: string; revenue_satang: number; units: number }[];
  low_stock_alerts: LowStockItem[];
}

// --- Admin catalog management ---

export interface AdminProductSummary {
  id: string;
  slug: string;
  name: string;
  category_name: string;
  brand_name: string;
  is_active: boolean;
  variant_count: number;
  stock_total: number;
  reserved_total: number;
  low_stock_count: number;
  min_price: number; // Satang
  thumbnail: string;
  updated_at: string;
}

export type StockReason = "INITIAL" | "RECEIVE" | "COUNT" | "DAMAGE" | "RETURN" | "SALE" | "CANCEL_RESTOCK";

export interface StockMovement {
  id: string;
  variant_id: string;
  delta: number;
  stock_after: number;
  reason: StockReason;
  note: string;
  actor_email: string;
  order_id: string | null;
  created_at: string;
}

export interface StockAdjustmentResult {
  variant_id: string;
  stock_quantity: number;
  reserved_stock: number;
  available_stock: number;
  delta: number;
}

export interface VariantInput {
  id?: string;
  sku: string;
  color_name: string;
  color_hex: string;
  price: number; // Satang
  compare_price: number; // Satang, 0 = none
  specs: Partial<VariantSpecs> & Record<string, unknown>;
  images: string[];
  initial_stock: number;
}

export interface ProductInput {
  name: string;
  slug: string;
  category_id: string;
  brand_id: string;
  tagline: string;
  short_description: string;
  usage_personas: string[];
  bento_highlights: BentoHighlightItem[];
  box_contents: BoxContentItem[];
  ports_diagram: PortsDiagramData;
  full_spec_matrix: SpecCategoryGroup[];
  is_active: boolean;
  variants: VariantInput[];
}

export type EmailKind = "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED" | "PASSWORD_RESET";
export type CancelReason = "customer" | "expired" | "store";

/** An email sent to the customer about an order. */
export interface EmailMessage {
  id: string;
  order_id?: string | null;
  user_id?: string | null;
  kind: EmailKind;
  sender: string;
  recipient: string;
  subject: string;
  preheader: string;
  data?: { reason?: CancelReason; token?: string; expires_minutes?: number } | null;
  sent_at: string;
}

export type Carrier = "KERRY" | "FLASH" | "DHL";
