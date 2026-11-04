package service

import (
	"context"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

type InteractionService interface {
	GetWishlist(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.Wishlist, error)
	ToggleWishlist(ctx context.Context, userID *uuid.UUID, guestID *string, productID uuid.UUID) (*dto.WishlistToggleResponse, error)
	GetCart(ctx context.Context, userID *uuid.UUID, guestID *string) (*dto.CartResponse, error)
	AddToCart(ctx context.Context, userID *uuid.UUID, guestID *string, req dto.AddToCartRequest) (*dto.CartResponse, error)
	UpdateCartQuantity(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID, quantity int) (*dto.CartResponse, error)
	RemoveFromCart(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID) (*dto.CartResponse, error)
}

type interactionService struct {
	wishlistRepo repository.WishlistRepository
	cartRepo     repository.CartRepository
}

func NewInteractionService(wishlistRepo repository.WishlistRepository, cartRepo repository.CartRepository) InteractionService {
	return &interactionService{
		wishlistRepo: wishlistRepo,
		cartRepo:     cartRepo,
	}
}

func (s *interactionService) GetWishlist(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.Wishlist, error) {
	return s.wishlistRepo.GetWishlist(ctx, userID, guestID)
}

func (s *interactionService) ToggleWishlist(ctx context.Context, userID *uuid.UUID, guestID *string, productID uuid.UUID) (*dto.WishlistToggleResponse, error) {
	liked, total, err := s.wishlistRepo.ToggleWishlist(ctx, userID, guestID, productID)
	if err != nil {
		return nil, err
	}
	return &dto.WishlistToggleResponse{
		Liked:      liked,
		TotalCount: total,
	}, nil
}

func (s *interactionService) GetCart(ctx context.Context, userID *uuid.UUID, guestID *string) (*dto.CartResponse, error) {
	items, err := s.cartRepo.GetCart(ctx, userID, guestID)
	if err != nil {
		return nil, err
	}

	return s.formatCartResponse(items), nil
}

func (s *interactionService) AddToCart(ctx context.Context, userID *uuid.UUID, guestID *string, req dto.AddToCartRequest) (*dto.CartResponse, error) {
	// Add primary variant
	if _, err := s.cartRepo.AddToCart(ctx, userID, guestID, req.VariantID, req.Quantity); err != nil {
		return nil, err
	}

	// Add accessory bundle variants if requested
	for _, accVariantID := range req.BundleAccessoryVariantIDs {
		_, _ = s.cartRepo.AddToCart(ctx, userID, guestID, accVariantID, 1)
	}

	return s.GetCart(ctx, userID, guestID)
}

func (s *interactionService) UpdateCartQuantity(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID, quantity int) (*dto.CartResponse, error) {
	if err := s.cartRepo.UpdateCartItemQuantity(ctx, userID, guestID, itemID, quantity); err != nil {
		return nil, err
	}
	return s.GetCart(ctx, userID, guestID)
}

func (s *interactionService) RemoveFromCart(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID) (*dto.CartResponse, error) {
	if err := s.cartRepo.RemoveCartItem(ctx, userID, guestID, itemID); err != nil {
		return nil, err
	}
	return s.GetCart(ctx, userID, guestID)
}

func (s *interactionService) formatCartResponse(items []models.CartItem) *dto.CartResponse {
	resp := &dto.CartResponse{
		Items:          make([]dto.CartItemDTO, 0, len(items)),
		TotalItems:     0,
		SubtotalAmount: 0,
	}

	for _, item := range items {
		availableStock := item.Variant.StockQuantity - item.Variant.ReservedStock
		if availableStock < 0 {
			availableStock = 0
		}
		itemTotal := item.Variant.Price * int64(item.Quantity)

		var productName, productSlug string
		if item.Variant.Product != nil {
			productName = item.Variant.Product.Name
			productSlug = item.Variant.Product.Slug
		}

		resp.Items = append(resp.Items, dto.CartItemDTO{
			ID:             item.ID,
			VariantID:      item.VariantID,
			ProductID:      item.Variant.ProductID,
			ProductName:    productName,
			ProductSlug:    productSlug,
			SKU:            item.Variant.SKU,
			ColorName:      item.Variant.ColorName,
			ColorHex:       item.Variant.ColorHex,
			Price:          item.Variant.Price,
			Quantity:       item.Quantity,
			AvailableStock: availableStock,
			Specs:          item.Variant.Specs,
			Images:         item.Variant.Images,
			ItemTotal:      itemTotal,
		})

		resp.TotalItems += item.Quantity
		resp.SubtotalAmount += itemTotal
	}

	return resp
}
