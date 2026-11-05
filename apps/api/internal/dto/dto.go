package dto

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// --- Auth DTOs ---

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UserDTO struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Phone     string    `json:"phone"`
	Address   string    `json:"address"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// UpdateProfileRequest replaces the signed-in user's editable profile fields.
type UpdateProfileRequest struct {
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	Address  string `json:"address"`
}

type AuthResponse struct {
	Token string  `json:"token"`
	User  UserDTO `json:"user"`
}

// --- Catalog & Filter DTOs ---

type CatalogFilter struct {
	Category string `json:"category"`
	Brand    string `json:"brand"`
	Persona  string `json:"persona"`
	CPU      string `json:"cpu"`
	RAM      int    `json:"ram"`
	Storage  int    `json:"storage"`
	MinPrice int64  `json:"min_price"` // Satang
	MaxPrice int64  `json:"max_price"` // Satang
	Sort     string `json:"sort"`      // price_asc, price_desc, newest
	Page     int    `json:"page"`
	Limit    int    `json:"limit"`
}

type FacetOption struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Count    int64  `json:"count"`
	Disabled bool   `json:"disabled"`
}

type FacetCounts struct {
	Personas   []FacetOption `json:"personas"`
	Brands     []FacetOption `json:"brands"`
	CPUFamily  []FacetOption `json:"cpu_family"`
	RAM        []FacetOption `json:"ram"`
	Storage    []FacetOption `json:"storage"`
	PriceRange struct {
		MinSatang int64 `json:"min_satang"`
		MaxSatang int64 `json:"max_satang"`
	} `json:"price_range"`
}

// --- Wishlist & Cart DTOs ---

type WishlistToggleRequest struct {
	ProductID uuid.UUID `json:"product_id"`
}

type WishlistToggleResponse struct {
	Liked      bool  `json:"liked"`
	TotalCount int64 `json:"total_count"`
}

type AddToCartRequest struct {
	VariantID                 uuid.UUID   `json:"variant_id"`
	Quantity                  int         `json:"quantity"`
	BundleAccessoryVariantIDs []uuid.UUID `json:"bundle_accessory_variant_ids,omitempty"`
}

type UpdateCartQuantityRequest struct {
	Quantity int `json:"quantity"`
}

type CartItemDTO struct {
	ID             uuid.UUID      `json:"id"`
	VariantID      uuid.UUID      `json:"variant_id"`
	ProductID      uuid.UUID      `json:"product_id"`
	ProductName    string         `json:"product_name"`
	ProductSlug    string         `json:"product_slug"`
	SKU            string         `json:"sku"`
	ColorName      string         `json:"color_name"`
	ColorHex       string         `json:"color_hex"`
	Price          int64          `json:"price"` // Satang
	Quantity       int            `json:"quantity"`
	AvailableStock int            `json:"available_stock"`
	Specs          datatypes.JSON `json:"specs"`
	Images         datatypes.JSON `json:"images"`
	ItemTotal      int64          `json:"item_total"` // Price * Quantity in Satang
}

type CartResponse struct {
	Items          []CartItemDTO `json:"items"`
	TotalItems     int           `json:"total_items"`
	SubtotalAmount int64         `json:"subtotal_amount"` // Satang
}

// --- Checkout & Payment DTOs ---

type ShippingAddressDTO struct {
	RecipientName string `json:"recipient_name"`
	Phone         string `json:"phone"`
	AddressLine1  string `json:"address_line_1"`
	AddressLine2  string `json:"address_line_2,omitempty"`
	District      string `json:"district"`
	Province      string `json:"province"`
	PostalCode    string `json:"postal_code"`
}

type CheckoutReserveRequest struct {
	CustomerEmail   string              `json:"customer_email"`
	ShippingAddress ShippingAddressDTO  `json:"shipping_address"`
	PaymentMethod   string              `json:"payment_method"` // PROMPTPAY_QR, CREDIT_CARD, INSTALLMENT_0
	InstallmentPlan *InstallmentPlanDTO `json:"installment_plan,omitempty"`
}

type InstallmentPlanDTO struct {
	BankCode         string `json:"bank_code"` // KBANK, SCB, KRUNGSRI, BBL
	BankName         string `json:"bank_name"`
	Months           int    `json:"months"` // 3, 6, 10
	InterestRate     int    `json:"interest_rate"`
	MonthlyPaySatang int64  `json:"monthly_pay_satang"`
}

type CheckoutReserveResponse struct {
	OrderNumber          string    `json:"order_number"`
	ReservationExpiresAt time.Time `json:"reservation_expires_at"`
	GrandTotalSatang     int64     `json:"grand_total_satang"`
	PaymentMethod        string    `json:"payment_method"`
}

type PaymentProcessRequest struct {
	OrderNumber     string              `json:"order_number"`
	PaymentMethod   string              `json:"payment_method"` // PROMPTPAY_QR, CREDIT_CARD, INSTALLMENT_0
	CardNumber      string              `json:"card_number,omitempty"`
	CardHolderName  string              `json:"card_holder_name,omitempty"`
	CardExpiry      string              `json:"card_expiry,omitempty"`
	CardCVV         string              `json:"card_cvv,omitempty"`
	InstallmentPlan *InstallmentPlanDTO `json:"installment_plan,omitempty"`
}

type PromptPayQRResponse struct {
	OrderNumber      string `json:"order_number"`
	GrandTotalSatang int64  `json:"grand_total_satang"`
	PromptPayPayload string `json:"promptpay_payload"`
	QRCodeDataURL    string `json:"qr_code_data_url"`
}

type InstallmentCalculationOption struct {
	BankCode         string `json:"bank_code"`
	BankName         string `json:"bank_name"`
	Months           int    `json:"months"`
	InterestRate     int    `json:"interest_rate"`
	MonthlyPaySatang int64  `json:"monthly_pay_satang"`
}

// --- Admin DTOs ---

type LowStockItem struct {
	VariantID      uuid.UUID `json:"variant_id"`
	ProductID      uuid.UUID `json:"product_id"`
	ProductName    string    `json:"product_name"`
	SKU            string    `json:"sku"`
	ColorName      string    `json:"color_name"`
	StockQuantity  int       `json:"stock_quantity"`
	ReservedStock  int       `json:"reserved_stock"`
	AvailableStock int       `json:"available_stock"`
}

// OrderListFilter selects a page of admin orders. Page and Limit are already validated.
type OrderListFilter struct {
	Status string // empty or "ALL" means every status
	Search string // case-insensitive match on order number or customer email
	Page   int
	Limit  int
}

// AdminOverviewStats is computed from orders. "Paid" means any status except PENDING_PAYMENT
// and CANCELLED; dates are order dates in the store's time zone (Asia/Bangkok).
type AdminOverviewStats struct {
	TotalRevenueSatang   int64             `json:"total_revenue_satang"` // all paid orders, all time
	PaidOrdersCount      int64             `json:"paid_orders_count"`
	TotalOrdersCount     int64             `json:"total_orders_count"` // every status
	OrdersByStatus       map[string]int64  `json:"orders_by_status"`
	Revenue30dSatang     int64             `json:"revenue_30d_satang"`      // last 30 days, today included
	RevenuePrev30dSatang int64             `json:"revenue_prev_30d_satang"` // the 30 days before that
	DailyRevenue         []DailyRevenue    `json:"daily_revenue"`           // last 7 days, oldest first, zero-filled
	CategoryRevenue      []CategoryRevenue `json:"category_revenue"`        // all paid line items, largest first
	LowStockAlerts       []LowStockItem    `json:"low_stock_alerts"`
}

type DailyRevenue struct {
	Date          string `json:"date"` // YYYY-MM-DD
	RevenueSatang int64  `json:"revenue_satang"`
	Orders        int64  `json:"orders"`
}

type CategoryRevenue struct {
	Category      string `json:"category"`
	RevenueSatang int64  `json:"revenue_satang"`
	Units         int64  `json:"units"`
}

type UpdateOrderStatusRequest struct {
	Status string `json:"status"` // PENDING_PAYMENT, PAID_PROCESSING, SN_ASSIGNED, SHIPPED, DELIVERED, CANCELLED
	// Order item ID -> one serial per unit. A blank entry keeps the saved serial for that unit.
	SerialNumbers map[string][]string `json:"serial_numbers,omitempty"`
}
