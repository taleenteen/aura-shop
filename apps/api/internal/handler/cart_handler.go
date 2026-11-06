package handler

import (
	"encoding/json"
	"errors"
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

// GetCart godoc
//
//	@Summary		Get the bag
//	@Description	Returns the bag of the signed-in customer, or of the guest session when signed out.
//	@Tags			Cart
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Success		200	{object}	response.Envelope{data=dto.CartResponse}
//	@Failure		500	{object}	response.Envelope
//	@Router			/cart [get]
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

// AddToCart godoc
//
//	@Summary		Add an option to the bag
//	@Description	Adds the variant (and any bundled accessories) to the bag and returns the updated bag.
//	@Tags			Cart
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			body	body		dto.AddToCartRequest	true	"Variant and quantity"
//	@Success		200		{object}	response.Envelope{data=dto.CartResponse}
//	@Failure		400		{object}	response.Envelope
//	@Failure		409		{object}	response.Envelope	"PRODUCT_UNAVAILABLE or INSUFFICIENT_STOCK"
//	@Router			/cart/items [post]
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
		if errors.Is(err, repository.ErrProductUnavailable) {
			response.Conflict(w, "PRODUCT_UNAVAILABLE", "This product is no longer available.")
			return
		}
		if err == repository.ErrInsufficientStock {
			response.Conflict(w, "INSUFFICIENT_STOCK", "The requested quantity exceeds available stock.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, cart, nil)
}

// UpdateQuantity godoc
//
//	@Summary	Change a bag line quantity
//	@Tags		Cart
//	@Accept		json
//	@Produce	json
//	@Security	BearerAuth
//	@Security	GuestSession
//	@Param		id		path		string							true	"Cart item ID (UUID)"
//	@Param		body	body		dto.UpdateCartQuantityRequest	true	"New quantity"
//	@Success	200		{object}	response.Envelope{data=dto.CartResponse}
//	@Failure	400		{object}	response.Envelope
//	@Failure	404		{object}	response.Envelope
//	@Failure	409		{object}	response.Envelope	"INSUFFICIENT_STOCK"
//	@Router		/cart/items/{id} [patch]
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

// RemoveItem godoc
//
//	@Summary	Remove a bag line
//	@Tags		Cart
//	@Produce	json
//	@Security	BearerAuth
//	@Security	GuestSession
//	@Param		id	path		string	true	"Cart item ID (UUID)"
//	@Success	200	{object}	response.Envelope{data=dto.CartResponse}
//	@Failure	400	{object}	response.Envelope
//	@Failure	404	{object}	response.Envelope
//	@Router		/cart/items/{id} [delete]
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
