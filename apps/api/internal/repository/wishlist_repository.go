package repository

import (
	"context"
	"errors"
	"fmt"

	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WishlistRepository interface {
	GetWishlist(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.Wishlist, error)
	ToggleWishlist(ctx context.Context, userID *uuid.UUID, guestID *string, productID uuid.UUID) (bool, int64, error)
	MergeGuestWishlist(ctx context.Context, tx *gorm.DB, guestID string, userID uuid.UUID) error
}

type wishlistRepository struct {
	db *gorm.DB
}

func NewWishlistRepository(db *gorm.DB) WishlistRepository {
	return &wishlistRepository{db: db}
}

func (r *wishlistRepository) GetWishlist(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.Wishlist, error) {
	query := r.db.WithContext(ctx).
		Preload("Product.Category").
		Preload("Product.Brand").
		Preload("Product.Variants").
		Order("created_at DESC")

	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	} else if guestID != nil && *guestID != "" {
		query = query.Where("guest_session_id = ?", *guestID)
	} else {
		return []models.Wishlist{}, nil
	}

	var items []models.Wishlist
	if err := query.Find(&items).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch wishlist: %w", err)
	}
	return items, nil
}

func (r *wishlistRepository) ToggleWishlist(ctx context.Context, userID *uuid.UUID, guestID *string, productID uuid.UUID) (bool, int64, error) {
	var liked bool
	var totalCount int64

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing models.Wishlist
		query := tx.Where("product_id = ?", productID)
		if userID != nil {
			query = query.Where("user_id = ?", *userID)
		} else if guestID != nil && *guestID != "" {
			query = query.Where("guest_session_id = ?", *guestID)
		} else {
			return errors.New("neither user_id nor guest_session_id provided")
		}

		err := query.First(&existing).Error
		if err == nil {
			// Item exists; unlike it
			if err := tx.Delete(&existing).Error; err != nil {
				return fmt.Errorf("failed to remove from wishlist: %w", err)
			}
			liked = false
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			// Item does not exist; like it
			newWish := models.Wishlist{
				UserID:         userID,
				GuestSessionID: guestID,
				ProductID:      productID,
			}
			if err := tx.Create(&newWish).Error; err != nil {
				return fmt.Errorf("failed to add to wishlist: %w", err)
			}
			liked = true
		} else {
			return fmt.Errorf("failed to query wishlist: %w", err)
		}

		// Count total user or guest wishlist items
		countQuery := tx.Model(&models.Wishlist{})
		if userID != nil {
			countQuery = countQuery.Where("user_id = ?", *userID)
		} else if guestID != nil {
			countQuery = countQuery.Where("guest_session_id = ?", *guestID)
		}
		if err := countQuery.Count(&totalCount).Error; err != nil {
			return fmt.Errorf("failed to count wishlist: %w", err)
		}

		return nil
	})

	if err != nil {
		return false, 0, err
	}
	return liked, totalCount, nil
}

func (r *wishlistRepository) MergeGuestWishlist(ctx context.Context, tx *gorm.DB, guestID string, userID uuid.UUID) error {
	if guestID == "" {
		return nil
	}

	var guestItems []models.Wishlist
	if err := tx.WithContext(ctx).Where("guest_session_id = ?", guestID).Find(&guestItems).Error; err != nil {
		return fmt.Errorf("failed to fetch guest wishlist items: %w", err)
	}

	for _, item := range guestItems {
		var count int64
		// Check if user already liked this product
		if err := tx.Model(&models.Wishlist{}).Where("user_id = ? AND product_id = ?", userID, item.ProductID).Count(&count).Error; err != nil {
			return err
		}

		if count == 0 {
			// Migrate row to user
			if err := tx.Model(&item).Updates(map[string]interface{}{
				"user_id":          userID,
				"guest_session_id": nil,
			}).Error; err != nil {
				return fmt.Errorf("failed to reassign wishlist item to user: %w", err)
			}
		} else {
			// Delete duplicate guest row
			if err := tx.Delete(&item).Error; err != nil {
				return fmt.Errorf("failed to delete duplicate guest wishlist item: %w", err)
			}
		}
	}

	return nil
}
