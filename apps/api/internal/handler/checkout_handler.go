package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type CheckoutHandler struct {
	checkoutService service.CheckoutService
}

func NewCheckoutHandler(checkoutService service.CheckoutService) *CheckoutHandler {
	return &CheckoutHandler{checkoutService: checkoutService}
}

func (h *CheckoutHandler) Reserve(w http.ResponseWriter, r *http.Request) {
	var req dto.CheckoutReserveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
		if req.CustomerEmail == "" {
			req.CustomerEmail = user.Email
		}
	}
	guestID := middleware.GetGuestIDFromContext(r.Context())

	if strings.TrimSpace(req.CustomerEmail) == "" {
		response.BadRequest(w, "customer_email is required")
		return
	}

	res, err := h.checkoutService.CreateReservation(r.Context(), userID, guestID, req)
	if err != nil {
		if err == service.ErrEmptyCart {
			response.BadRequest(w, err.Error())
			return
		}
		// If stock was insufficient, return 409 conflict
		if strings.Contains(strings.ToLower(err.Error()), "insufficient stock") {
			response.Conflict(w, "INSUFFICIENT_STOCK", err.Error())
			return
		}
		response.InternalServerError(w, err.Error())
		return
	}

	response.Success(w, http.StatusCreated, res, nil)
}

func (h *CheckoutHandler) Pay(w http.ResponseWriter, r *http.Request) {
	var req dto.PaymentProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	if req.OrderNumber == "" {
		response.BadRequest(w, "order_number is required")
		return
	}

	if !h.requesterOwnsOrder(w, r, req.OrderNumber, false) {
		return
	}

	order, err := h.checkoutService.ProcessPayment(r.Context(), req)
	if err != nil {
		if err == service.ErrCardDeclined {
			// Specific contract: Return CARD_DECLINED_INSUFFICIENT_FUNDS without releasing lock
			response.Error(w, http.StatusPaymentRequired, "CARD_DECLINED_INSUFFICIENT_FUNDS", "Your bank declined the transaction due to insufficient funds or test simulation.")
			return
		}
		if err == repository.ErrReservationExpired {
			response.Conflict(w, "RESERVATION_EXPIRED", "The 15-minute checkout reservation has expired. Please re-add items to your cart.")
			return
		}
		if err == repository.ErrOrderNotFound {
			response.NotFound(w, "order not found")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, order, nil)
}

func (h *CheckoutHandler) GetPromptPayQR(w http.ResponseWriter, r *http.Request) {
	orderNumber := chi.URLParam(r, "orderNumber")
	if orderNumber == "" {
		response.BadRequest(w, "orderNumber is required")
		return
	}

	if !h.requesterOwnsOrder(w, r, orderNumber, false) {
		return
	}

	qrResp, err := h.checkoutService.GeneratePromptPayQR(r.Context(), orderNumber)
	if err != nil {
		if err == repository.ErrOrderNotFound {
			response.NotFound(w, "order not found")
			return
		}
		response.InternalServerError(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, qrResp, nil)
}

func (h *CheckoutHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	orderNumber := chi.URLParam(r, "orderNumber")
	if orderNumber == "" {
		response.BadRequest(w, "orderNumber is required")
		return
	}

	order, ok := h.loadOwnedOrder(w, r, orderNumber, true)
	if !ok {
		return
	}

	response.Success(w, http.StatusOK, order, nil)
}

// loadOwnedOrder fetches an order and writes a 404 unless the requester placed it (same user or
// same guest session), or allowAdmin is set and the requester is an admin. Orders that belong to
// someone else are reported as not found so order numbers cannot be probed.
func (h *CheckoutHandler) loadOwnedOrder(w http.ResponseWriter, r *http.Request, orderNumber string, allowAdmin bool) (*models.Order, bool) {
	order, err := h.checkoutService.GetOrderByNumber(r.Context(), orderNumber)
	if err != nil {
		if errors.Is(err, repository.ErrOrderNotFound) {
			response.NotFound(w, "order not found")
			return nil, false
		}
		response.InternalServerError(w, err.Error())
		return nil, false
	}

	var userID *uuid.UUID
	user := middleware.GetUserFromContext(r.Context())
	if user != nil {
		userID = &user.ID
	}
	if order.IsVisibleTo(userID, middleware.GetGuestIDFromContext(r.Context())) ||
		(allowAdmin && user != nil && user.Role == "ADMIN") {
		return order, true
	}
	response.NotFound(w, "order not found")
	return nil, false
}

func (h *CheckoutHandler) requesterOwnsOrder(w http.ResponseWriter, r *http.Request, orderNumber string, allowAdmin bool) bool {
	_, ok := h.loadOwnedOrder(w, r, orderNumber, allowAdmin)
	return ok
}

func (h *CheckoutHandler) CalculateInstallments(w http.ResponseWriter, r *http.Request) {
	amountStr := chi.URLParam(r, "satangAmount")
	amount, err := strconv.ParseInt(amountStr, 10, 64)
	if err != nil || amount <= 0 {
		response.BadRequest(w, "valid satangAmount is required")
		return
	}

	options := h.checkoutService.CalculateInstallments(amount)
	response.Success(w, http.StatusOK, options, nil)
}
