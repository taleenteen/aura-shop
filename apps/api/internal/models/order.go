package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type StockReservation struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderID   uuid.UUID `gorm:"type:uuid;index;not null" json:"order_id"`
	VariantID uuid.UUID `gorm:"type:uuid;index;not null" json:"variant_id"`
	Quantity  int       `gorm:"not null" json:"quantity"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expires_at"` // CreatedAt + 15 minutes
	Status    string    `gorm:"default:'ACTIVE'" json:"status"`   // ACTIVE, COMMITTED, RELEASED
}

const (
	OrderStatusPendingPayment = "PENDING_PAYMENT"
	OrderStatusPaidProcessing = "PAID_PROCESSING"
	OrderStatusSNAssigned     = "SN_ASSIGNED"
	OrderStatusShipped        = "SHIPPED"
	OrderStatusDelivered      = "DELIVERED"
	OrderStatusCancelled      = "CANCELLED"
)

// adminOrderTransitions lists the status changes an admin may make. Payment is not here:
// PENDING_PAYMENT -> PAID_PROCESSING only happens through checkout, which commits stock.
// A self-transition is allowed where serial numbers are still being recorded.
var adminOrderTransitions = map[string][]string{
	OrderStatusPendingPayment: {OrderStatusCancelled},
	OrderStatusPaidProcessing: {OrderStatusPaidProcessing, OrderStatusSNAssigned, OrderStatusShipped, OrderStatusCancelled},
	OrderStatusSNAssigned:     {OrderStatusSNAssigned, OrderStatusShipped, OrderStatusCancelled},
	OrderStatusShipped:        {OrderStatusDelivered},
}

// CanAdminTransitionOrder reports whether an admin may move an order from one status to another.
func CanAdminTransitionOrder(from, to string) bool {
	for _, allowed := range adminOrderTransitions[from] {
		if allowed == to {
			return true
		}
	}
	return false
}

// SerialsEditable reports whether serial numbers may still be recorded for an order in this status.
func SerialsEditable(status string) bool {
	return status == OrderStatusPaidProcessing || status == OrderStatusSNAssigned
}

// AdminOrderTransitions returns the statuses an admin may move an order to from its current status.
func AdminOrderTransitions(from string) []string {
	return append([]string(nil), adminOrderTransitions[from]...)
}

type Order struct {
	ID                   uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderNumber          string         `gorm:"uniqueIndex;not null" json:"order_number"` // Format: AURA-YYYYMMDD-XXXX
	UserID               *uuid.UUID     `gorm:"type:uuid;index" json:"user_id"`
	GuestSessionID       *string        `gorm:"type:varchar(64);index" json:"guest_session_id"`
	CustomerEmail        string         `gorm:"not null" json:"customer_email"`
	Status               string         `gorm:"index;not null" json:"status"` // PENDING_PAYMENT, PAID_PROCESSING, SN_ASSIGNED, SHIPPED, DELIVERED, CANCELLED
	SubtotalAmount       int64          `gorm:"not null" json:"subtotal_amount"`
	DiscountAmount       int64          `gorm:"default:0" json:"discount_amount"`
	GrandTotal           int64          `gorm:"not null" json:"grand_total"`
	ShippingAddress      datatypes.JSON `gorm:"type:jsonb;not null" json:"shipping_address"`
	PaymentMethod        string         `gorm:"not null" json:"payment_method"` // PROMPTPAY_QR, CREDIT_CARD, INSTALLMENT_0
	InstallmentPlan      datatypes.JSON `gorm:"type:jsonb" json:"installment_plan"`
	ReservationExpiresAt time.Time      `json:"reservation_expires_at"`
	Items                []OrderItem    `gorm:"foreignKey:OrderID" json:"items"`
	AllowedTransitions   []string       `gorm:"-" json:"allowed_transitions,omitempty"` // filled for admin listings
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
}

type OrderItem struct {
	ID           uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderID      uuid.UUID `gorm:"type:uuid;index;not null" json:"order_id"`
	VariantID    uuid.UUID `gorm:"type:uuid;not null" json:"variant_id"`
	SKUSnapshot  string    `gorm:"not null" json:"sku_snapshot"`
	NameSnapshot string    `gorm:"not null" json:"name_snapshot"`
	SpecSummary  string    `json:"spec_summary"` // e.g., "Space Black / M4 Pro / 24GB / 512GB"
	UnitPrice    int64     `gorm:"not null" json:"unit_price"`
	Quantity     int       `gorm:"not null" json:"quantity"`
	// One warranty serial per unit (index i = unit i+1). Every unit needs one before SHIPPED.
	// Replaces the legacy single-value serial_number column, which is backfilled on migration.
	SerialNumbers datatypes.JSONSlice[string] `gorm:"type:jsonb" json:"serial_numbers"`
}
