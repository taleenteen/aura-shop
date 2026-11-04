package models

import (
	"time"

	"github.com/google/uuid"
)

type Wishlist struct {
	ID             uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID         *uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	GuestSessionID *string    `gorm:"type:varchar(64);index" json:"guest_session_id"`
	ProductID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"product_id"`
	Product        Product    `gorm:"foreignKey:ProductID" json:"product"`
	CreatedAt      time.Time  `json:"created_at"`
}

type CartItem struct {
	ID             uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID         *uuid.UUID     `gorm:"type:uuid;index" json:"user_id"`
	GuestSessionID *string        `gorm:"type:varchar(64);index" json:"guest_session_id"`
	VariantID      uuid.UUID      `gorm:"type:uuid;not null" json:"variant_id"`
	Variant        ProductVariant `gorm:"foreignKey:VariantID" json:"variant"`
	Quantity       int            `gorm:"not null;default:1" json:"quantity"`
	UpdatedAt      time.Time      `json:"updated_at"`
}
