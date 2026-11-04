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
	SerialNumber string    `gorm:"index" json:"serial_number"` // Mandatory before status can transition to SHIPPED
}
