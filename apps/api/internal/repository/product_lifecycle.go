package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	// ErrProductArchived blocks putting an archived product on sale; restore it first.
	ErrProductArchived = errors.New("this product is archived; restore it before putting it on sale")
	// ErrProductHasOrders blocks deleting a product that orders refer to; archive it instead.
	ErrProductHasOrders = errors.New("product has orders")
)

// ArchiveProduct takes a product off sale and out of the everyday product list. Orders,
// reports and the stock ledger keep pointing at it, and it can be restored. Shoppers can no
// longer add it to a bag; bag lines already there stay and show as unavailable.
func (r *productAdminRepository) ArchiveProduct(ctx context.Context, id uuid.UUID) error {
	res := r.db.WithContext(ctx).Model(&models.Product{}).
		Where("id = ? AND archived_at IS NULL", id).
		Updates(map[string]any{"archived_at": time.Now(), "is_active": false})
	if res.Error != nil {
		return fmt.Errorf("failed to archive product: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return r.missingOr(ctx, id, nil) // already archived: nothing to do
	}
	return nil
}

// RestoreProduct brings an archived product back to the product list. It stays off sale, so
// the admin can check price and stock before putting it on sale again.
func (r *productAdminRepository) RestoreProduct(ctx context.Context, id uuid.UUID) error {
	res := r.db.WithContext(ctx).Model(&models.Product{}).
		Where("id = ? AND archived_at IS NOT NULL", id).
		Update("archived_at", nil)
	if res.Error != nil {
		return fmt.Errorf("failed to restore product: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return r.missingOr(ctx, id, nil) // not archived: nothing to do
	}
	return nil
}

// DeleteProduct removes a product for good, with its variants and everything that only
// exists because of it: bag lines, wishlist hearts, stock alerts, stock history, reviews and
// bundle links. A product that any order (or checkout hold) refers to cannot be deleted, so
// order history and sales reports never lose a line; archive it instead.
func (r *productAdminRepository) DeleteProduct(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the product so an order cannot be placed for it while it is being deleted.
		var p models.Product
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").First(&p, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProductNotFound
			}
			return err
		}
		variants := tx.Model(&models.ProductVariant{}).Select("id").Where("product_id = ?", id)

		var orders int64
		if err := tx.Model(&models.OrderItem{}).Where("variant_id IN (?)", variants).
			Distinct("order_id").Count(&orders).Error; err != nil {
			return err
		}
		var holds int64
		if err := tx.Model(&models.StockReservation{}).Where("variant_id IN (?)", variants).Count(&holds).Error; err != nil {
			return err
		}
		if orders > 0 || holds > 0 {
			return fmt.Errorf("%w: it is on %d order(s) or checkout hold(s)", ErrProductHasOrders, orders+holds)
		}

		// Children first: the database refuses to drop a row that others still point at.
		deletes := []*gorm.DB{
			tx.Where("variant_id IN (?)", variants).Delete(&models.CartItem{}),
			tx.Where("variant_id IN (?)", variants).Delete(&models.StockAlert{}),
			tx.Where("variant_id IN (?)", variants).Delete(&models.StockMovement{}),
			tx.Where("product_id = ?", id).Delete(&models.Wishlist{}),
			tx.Where("product_id = ?", id).Delete(&models.Review{}),
			tx.Where("main_product_id = ? OR accessory_product_id = ?", id, id).Delete(&models.ProductAccessoryBundle{}),
			tx.Where("product_id = ?", id).Delete(&models.ProductVariant{}),
			tx.Where("id = ?", id).Delete(&models.Product{}),
		}
		for _, d := range deletes {
			if d.Error != nil {
				return fmt.Errorf("failed to delete product: %w", d.Error)
			}
		}
		return nil
	})
}

// missingOr returns ErrProductNotFound when the product does not exist, otherwise fallback.
func (r *productAdminRepository) missingOr(ctx context.Context, id uuid.UUID, fallback error) error {
	var n int64
	if err := r.db.WithContext(ctx).Model(&models.Product{}).Where("id = ?", id).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return ErrProductNotFound
	}
	return fallback
}
