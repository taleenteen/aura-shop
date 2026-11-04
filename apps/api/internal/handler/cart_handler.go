package handler

import (
	"encoding/json"
	"net/http"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type CartHandler struct {
	interactionService service.InteractionService
}

func NewCartHandler(interactionService service.InteractionService) *CartHandler {
	return &CartHandler{interactionService: interactionService}
}

func (h *CartHandler) GetCart(w http.ResponseWriter, r *http.Request) {
	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	cart, err := h.interactionService.GetCart(r.Context(), userID, guestID)
	if err != nil {
		response.InternalServerError(w, "failed to fetch cart")
		return
	}

	response.Success(w, http.StatusOK, cart, nil)
}

func (h *CartHandler) AddToCart(w http.ResponseWriter, r *http.Request) {
	var req dto.AddToCartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	if req.VariantID == uuid.Nil {
		response.BadRequest(w, "variant_id is required")
		return
	}

	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	cart, err := h.interactionService.AddToCart(r.Context(), userID, guestID, req)
	if err != nil {
		if err == repository.ErrInsufficientStock {
			response.Conflict(w, "INSUFFICIENT_STOCK", "The requested quantity exceeds available stock.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, cart, nil)
}

func (h *CartHandler) UpdateQuantity(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		response.BadRequest(w, "invalid cart item id")
		return
	}

	var req dto.UpdateCartQuantityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	cart, err := h.interactionService.UpdateCartQuantity(r.Context(), userID, guestID, itemID, req.Quantity)
	if err != nil {
		if err == repository.ErrInsufficientStock {
			response.Conflict(w, "INSUFFICIENT_STOCK", "Requested quantity exceeds available stock.")
			return
		}
		if err == repository.ErrCartItemNotFound {
			response.NotFound(w, "cart item not found")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, cart, nil)
}

func (h *CartHandler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		response.BadRequest(w, "invalid cart item id")
		return
	}

	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	cart, err := h.interactionService.RemoveFromCart(r.Context(), userID, guestID, itemID)
	if err != nil {
		if err == repository.ErrCartItemNotFound {
			response.NotFound(w, "cart item not found")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, cart, nil)
}
