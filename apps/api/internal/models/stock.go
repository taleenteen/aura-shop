package models

import (
	"time"

	"github.com/google/uuid"
)

// Reasons a variant's physical stock changed. Every change to stock_quantity writes one
// StockMovement, so the ledger explains the current number.
const (
	StockReasonInitial       = "INITIAL"        // stock entered when a variant is created
	StockReasonReceive       = "RECEIVE"        // goods received from a supplier
	StockReasonCount         = "COUNT"          // correction after a physical count
	StockReasonDamage        = "DAMAGE"         // written off as damaged or lost
	StockReasonReturn        = "RETURN"         // customer return put back on sale
	StockReasonSale          = "SALE"           // order paid; reserved units leave stock
	StockReasonCancelRestock = "CANCEL_RESTOCK" // paid order cancelled; units come back
)

// AdminStockReasons are the reasons an admin may pick for a manual adjustment.
var AdminStockReasons = []string{StockReasonReceive, StockReasonCount, StockReasonDamage, StockReasonReturn}

type StockMovement struct {
	ID         uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	VariantID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"variant_id"`
	Delta      int        `gorm:"not null" json:"delta"`       // signed change to stock_quantity
	StockAfter int        `gorm:"not null" json:"stock_after"` // stock_quantity after this change
	Reason     string     `gorm:"type:varchar(20);not null" json:"reason"`
	Note       string     `gorm:"type:text;not null;default:''" json:"note"`
	ActorID    *uuid.UUID `gorm:"type:uuid" json:"actor_id"` // admin who made a manual change
	ActorEmail string     `gorm:"type:varchar(255);not null;default:''" json:"actor_email"`
	OrderID    *uuid.UUID `gorm:"type:uuid;index" json:"order_id"` // order behind a SALE or CANCEL_RESTOCK
	CreatedAt  time.Time  `gorm:"index" json:"created_at"`
}
