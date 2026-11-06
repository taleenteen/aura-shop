package handler

import (
	"encoding/json"
	"net/http"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/google/uuid"
)

type WishlistHandler struct {
	interactionService service.InteractionService
}

func NewWishlistHandler(interactionService service.InteractionService) *WishlistHandler {
	return &WishlistHandler{interactionService: interactionService}
}

// GetWishlist godoc
//
//	@Summary		Get the wishlist
//	@Description	Returns the wishlist of the signed-in customer, or of the guest session when signed out.
//	@Tags			Wishlist
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Success		200	{object}	response.Envelope{data=[]models.Wishlist}
//	@Failure		500	{object}	response.Envelope
//	@Router			/wishlist [get]
func (h *WishlistHandler) GetWishlist(w http.ResponseWriter, r *http.Request) {
	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	items, err := h.interactionService.GetWishlist(r.Context(), userID, guestID)
	if err != nil {
		response.InternalServerError(w, "failed to fetch wishlist")
		return
	}

	response.Success(w, http.StatusOK, items, nil)
}

// ToggleWishlist godoc
//
//	@Summary		Add or remove a product from the wishlist
//	@Description	Adds the product when it is not saved yet, otherwise removes it. Returns the new state and the wishlist size.
//	@Tags			Wishlist
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			body	body		dto.WishlistToggleRequest	true	"Product to toggle"
//	@Success		200		{object}	response.Envelope{data=dto.WishlistToggleResponse}
//	@Failure		400		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/wishlist/toggle [post]
func (h *WishlistHandler) ToggleWishlist(w http.ResponseWriter, r *http.Request) {
	var req dto.WishlistToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	if req.ProductID == uuid.Nil {
		response.BadRequest(w, "product_id is required")
		return
	}

	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	res, err := h.interactionService.ToggleWishlist(r.Context(), userID, guestID, req.ProductID)
	if err != nil {
		response.InternalServerError(w, "failed to toggle wishlist")
		return
	}

	response.Success(w, http.StatusOK, res, nil)
}
