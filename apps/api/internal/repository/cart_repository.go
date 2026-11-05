package repository

import (
	"context"
	"errors"
	"fmt"

	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrInsufficientStock = errors.New("insufficient available stock")
	ErrCartItemNotFound  = errors.New("cart item not found")
	// ErrProductUnavailable means the product was taken off sale.
	ErrProductUnavailable = errors.New("this product is no longer available")
)

type CartRepository interface {
	GetCart(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.CartItem, error)
	AddToCart(ctx context.Context, userID *uuid.UUID, guestID *string, variantID uuid.UUID, quantity int) (*models.CartItem, error)
	UpdateCartItemQuantity(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID, quantity int) error
	RemoveCartItem(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID) error
	ClearCart(ctx context.Context, tx *gorm.DB, userID *uuid.UUID, guestID *string) error
	MergeGuestCart(ctx context.Context, tx *gorm.DB, guestID string, userID uuid.UUID) error
}

type cartRepository struct {
	db *gorm.DB
}

func NewCartRepository(db *gorm.DB) CartRepository {
	return &cartRepository{db: db}
}

func (r *cartRepository) GetCart(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.CartItem, error) {
	query := r.db.WithContext(ctx).
		Preload("Variant.Product").
		Order("updated_at DESC")

	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	} else if guestID != nil && *guestID != "" {
		query = query.Where("guest_session_id = ? AND user_id IS NULL", *guestID)
	} else {
		return []models.CartItem{}, nil
	}

	var items []models.CartItem
	if err := query.Find(&items).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch cart items: %w", err)
	}
	return items, nil
}

func (r *cartRepository) AddToCart(ctx context.Context, userID *uuid.UUID, guestID *string, variantID uuid.UUID, quantity int) (*models.CartItem, error) {
	if quantity <= 0 {
		quantity = 1
	}

	var createdItem models.CartItem

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var variant models.ProductVariant
		if err := tx.First(&variant, "id = ?", variantID).Error; err != nil {
			return fmt.Errorf("variant not found: %w", err)
		}
		if err := requireOnSale(tx, variant.ProductID); err != nil {
			return err
		}

		available := variant.StockQuantity - variant.ReservedStock

		var existing models.CartItem
		q := tx.Where("variant_id = ?", variantID)
		if userID != nil {
			q = q.Where("user_id = ?", *userID)
		} else if guestID != nil {
			q = q.Where("guest_session_id = ? AND user_id IS NULL", *guestID)
		} else {
			return errors.New("no user or guest identifier for cart")
		}

		err := q.First(&existing).Error
		if err == nil {
			// Item exists; update quantity
			newQty := existing.Quantity + quantity
			if newQty > available {
				return ErrInsufficientStock
			}
			existing.Quantity = newQty
			if err := tx.Save(&existing).Error; err != nil {
				return fmt.Errorf("failed to update cart item quantity: %w", err)
			}
			createdItem = existing
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			// Item does not exist; check stock and create
			if quantity > available {
				return ErrInsufficientStock
			}
			newItem := models.CartItem{
				UserID:         userID,
				GuestSessionID: guestOnly(userID, guestID),
				VariantID:      variantID,
				Quantity:       quantity,
			}
			if err := tx.Create(&newItem).Error; err != nil {
				return fmt.Errorf("failed to create cart item: %w", err)
			}
			createdItem = newItem
		} else {
			return fmt.Errorf("failed to query cart: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Preload variant & product for return
	_ = r.db.WithContext(ctx).Preload("Variant.Product").First(&createdItem, "id = ?", createdItem.ID).Error
	return &createdItem, nil
}

func (r *cartRepository) UpdateCartItemQuantity(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID, quantity int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item models.CartItem
		q := tx.Where("id = ?", itemID)
		if userID != nil {
			q = q.Where("user_id = ?", *userID)
		} else if guestID != nil {
			q = q.Where("guest_session_id = ? AND user_id IS NULL", *guestID)
		}

		if err := q.First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCartItemNotFound
			}
			return err
		}

		if quantity <= 0 {
			return tx.Delete(&item).Error
		}

		var variant models.ProductVariant
		if err := tx.First(&variant, "id = ?", item.VariantID).Error; err != nil {
			return err
		}

		available := variant.StockQuantity - variant.ReservedStock
		if quantity > available {
			return ErrInsufficientStock
		}

		item.Quantity = quantity
		return tx.Save(&item).Error
	})
}

func (r *cartRepository) RemoveCartItem(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID) error {
	q := r.db.WithContext(ctx).Where("id = ?", itemID)
	if userID != nil {
		q = q.Where("user_id = ?", *userID)
	} else if guestID != nil {
		q = q.Where("guest_session_id = ? AND user_id IS NULL", *guestID)
	}
	res := q.Delete(&models.CartItem{})
	if res.Error != nil {
		return fmt.Errorf("failed to delete cart item: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrCartItemNotFound
	}
	return nil
}

func (r *cartRepository) ClearCart(ctx context.Context, tx *gorm.DB, userID *uuid.UUID, guestID *string) error {
	db := r.db
	if tx != nil {
		db = tx
	}

	q := db.WithContext(ctx)
	if userID != nil {
		q = q.Where("user_id = ?", *userID)
	} else if guestID != nil {
		q = q.Where("guest_session_id = ? AND user_id IS NULL", *guestID)
	} else {
		return nil
	}

	return q.Delete(&models.CartItem{}).Error
}

func (r *cartRepository) MergeGuestCart(ctx context.Context, tx *gorm.DB, guestID string, userID uuid.UUID) error {
	if guestID == "" {
		return nil
	}

	var guestItems []models.CartItem
	if err := tx.WithContext(ctx).Where("guest_session_id = ? AND user_id IS NULL", guestID).Find(&guestItems).Error; err != nil {
		return fmt.Errorf("failed to fetch guest cart items: %w", err)
	}

	for _, item := range guestItems {
		var userExisting models.CartItem
		err := tx.Where("user_id = ? AND variant_id = ?", userID, item.VariantID).First(&userExisting).Error
		if err == nil {
			// User already has this variant in cart; combine quantities
			userExisting.Quantity += item.Quantity
			if err := tx.Save(&userExisting).Error; err != nil {
				return fmt.Errorf("failed to update user cart quantity on merge: %w", err)
			}
			// Delete guest item
			if err := tx.Delete(&item).Error; err != nil {
				return fmt.Errorf("failed to delete guest cart item: %w", err)
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			// Migrate guest item to user
			if err := tx.Model(&item).Updates(map[string]interface{}{
				"user_id":          userID,
				"guest_session_id": nil,
			}).Error; err != nil {
				return fmt.Errorf("failed to migrate guest cart item to user: %w", err)
			}
		} else {
			return err
		}
	}

	return nil
}

// requireOnSale fails with ErrProductUnavailable when the product has been taken off sale.
func requireOnSale(tx *gorm.DB, productID uuid.UUID) error {
	var active bool
	if err := tx.Model(&models.Product{}).Select("is_active").Where("id = ?", productID).Scan(&active).Error; err != nil {
		return fmt.Errorf("failed to check product status: %w", err)
	}
	if !active {
		return ErrProductUnavailable
	}
	return nil
}
