package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Cart items and wishlist rows belong either to a signed-in user (user_id set) or to an
// anonymous browser (guest_session_id set, user_id NULL), never both. Guest queries therefore
// match "guest_session_id = ? AND user_id IS NULL", so a browser that signs out cannot see or
// change the account's rows, and merging a guest into a user cannot pick up the user's own rows.

// guestOnly returns the guest session to store on a new row: none when the row is the user's.
func guestOnly(userID *uuid.UUID, guestID *string) *string {
	if userID != nil {
		return nil
	}
	return guestID
}

// orderVariants gives every product's variants one stable order: cheapest first, then SKU.
// Without it Postgres returns rows in storage order, which changes whenever a row is updated
// (a stock change, for example), so the product page's default variant would drift.
func orderVariants(db *gorm.DB) *gorm.DB {
	return db.Order("product_variants.price ASC, product_variants.sku ASC")
}
