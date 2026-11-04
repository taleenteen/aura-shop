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
