package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// StockAlert asks to email a signed-in customer when an out-of-stock variant can be bought
// again. It is pending until NotifiedAt is set; a customer has at most one pending alert per
// variant (partial unique index).
type StockAlert struct {
	ID         uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"user_id"`
	VariantID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"variant_id"`
	CreatedAt  time.Time  `json:"created_at"`
	NotifiedAt *time.Time `json:"notified_at"`
}

// Review is a customer's rating of a product they received. One per customer per product.
type Review struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ProductID uuid.UUID `gorm:"type:uuid;index;not null;uniqueIndex:idx_reviews_product_user" json:"product_id"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null;uniqueIndex:idx_reviews_product_user" json:"user_id"`
	Rating    int       `gorm:"not null" json:"rating"` // 1-5
	Title     string    `gorm:"type:varchar(120);not null;default:''" json:"title"`
	Body      string    `gorm:"type:text;not null;default:''" json:"body"`
	IsHidden  bool      `gorm:"not null;default:false;index" json:"is_hidden"` // hidden by an admin
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BackInStock describes the variant in a back-in-stock email.
type BackInStock struct {
	ProductName string `json:"product_name"`
	ProductSlug string `json:"product_slug"`
	VariantID   string `json:"variant_id"`
	Variant     string `json:"variant"` // e.g. "Midnight / MBA13-M3-16-256-MN"
	Image       string `json:"image"`
	Price       int64  `json:"price"`
}

// NewBackInStockEmail builds the email sent when a variant someone waited for is available.
func NewBackInStockEmail(userID uuid.UUID, email string, item BackInStock, now time.Time) EmailMessage {
	data, _ := json.Marshal(item)
	return EmailMessage{
		UserID:    &userID,
		Kind:      EmailBackInStock,
		Sender:    EmailSender,
		Recipient: email,
		Subject:   "Back in stock: " + item.ProductName,
		Preheader: "The " + item.ProductName + " you asked about is available again. Stock is limited.",
		Data:      data,
		SentAt:    now,
	}
}
