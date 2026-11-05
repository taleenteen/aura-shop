package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
	"aura-tech/api/internal/validate"

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

	email, ok := validate.Email(req.CustomerEmail)
	if !ok {
		response.ValidationFailed(w, "Enter a valid email address.", map[string]string{"customer_email": "Enter a valid email address."})
		return
	}
	req.CustomerEmail = email

	res, err := h.checkoutService.CreateReservation(r.Context(), userID, guestID, req)
	if err != nil {
		if err == service.ErrEmptyCart {
			response.BadRequest(w, err.Error())
			return
		}
		// If stock was insufficient, return 409 conflict
		if errors.Is(err, repository.ErrProductUnavailable) {
			response.Conflict(w, "PRODUCT_UNAVAILABLE", err.Error())
			return
		}
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

	if _, ok := h.loadOrder(w, r, req.OrderNumber, accessOwner); !ok {
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

	if _, ok := h.loadOrder(w, r, orderNumber, accessOwner); !ok {
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

	order, ok := h.loadOrder(w, r, orderNumber, accessViewer)
	if !ok {
		return
	}

	response.Success(w, http.StatusOK, order, nil)
}

// orderAccess says who may act on an order.
type orderAccess int

const (
	// accessOwner: only the requester who placed it (same user or same guest session).
	accessOwner orderAccess = iota
	// accessViewer: the owner, an admin, or someone who proves the order email through the
	// X-Order-Email header (set by the storefront after an order lookup).
	accessViewer
)

// orderEmailHeader carries the email a customer entered in the order lookup.
const orderEmailHeader = "X-Order-Email"

// loadOrder fetches an order and writes a 404 unless the requester has the given access.
// Orders the requester may not see are reported as not found so order numbers cannot be probed.
func (h *CheckoutHandler) loadOrder(w http.ResponseWriter, r *http.Request, orderNumber string, access orderAccess) (*models.Order, bool) {
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
	order.ViewerCanManage = order.IsVisibleTo(userID, middleware.GetGuestIDFromContext(r.Context()))
	if order.ViewerCanManage {
		return order, true
	}
	if access == accessViewer {
		isAdmin := user != nil && user.Role == "ADMIN"
		if isAdmin || emailMatches(order.CustomerEmail, r.Header.Get(orderEmailHeader)) {
			return order, true
		}
	}
	response.NotFound(w, "order not found")
	return nil, false
}

func emailMatches(orderEmail, given string) bool {
	given = strings.TrimSpace(given)
	return given != "" && strings.EqualFold(strings.TrimSpace(orderEmail), given)
}

// LookupOrder finds an order by number and the email it was placed with.
func (h *CheckoutHandler) LookupOrder(w http.ResponseWriter, r *http.Request) {
	var req dto.OrderLookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	number := strings.ToUpper(strings.TrimSpace(req.OrderNumber))
	fields := map[string]string{}
	if number == "" {
		fields["order_number"] = "Enter your order number."
	}
	if strings.TrimSpace(req.Email) == "" {
		fields["email"] = "Enter the email you ordered with."
	} else if _, ok := validate.Email(req.Email); !ok {
		fields["email"] = "Enter a valid email address."
	}
	if len(fields) > 0 {
		response.ValidationFailed(w, "Enter your order number and email.", fields)
		return
	}
	order, err := h.checkoutService.GetOrderByNumber(r.Context(), number)
	if err != nil && !errors.Is(err, repository.ErrOrderNotFound) {
		response.InternalServerError(w, err.Error())
		return
	}
	if order == nil || !emailMatches(order.CustomerEmail, req.Email) {
		response.NotFound(w, "We couldn't find an order with that number and email.")
		return
	}
	var userID *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		userID = &user.ID
	}
	order.ViewerCanManage = order.IsVisibleTo(userID, middleware.GetGuestIDFromContext(r.Context()))
	response.Success(w, http.StatusOK, order, nil)
}

// CancelOrder lets the customer who placed an unpaid order cancel it.
func (h *CheckoutHandler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	orderNumber := chi.URLParam(r, "orderNumber")
	current, ok := h.loadOrder(w, r, orderNumber, accessOwner)
	if !ok {
		return
	}
	order, err := h.checkoutService.CancelOrder(r.Context(), orderNumber)
	if err != nil {
		if errors.Is(err, repository.ErrOrderNotCancellable) {
			msg := "This order has already been paid. Contact us to cancel it."
			if current.Status == models.OrderStatusCancelled {
				msg = "This order is already cancelled."
			}
			response.Conflict(w, "ORDER_NOT_CANCELLABLE", msg)
			return
		}
		if errors.Is(err, repository.ErrOrderNotFound) {
			response.NotFound(w, "order not found")
			return
		}
		response.InternalServerError(w, err.Error())
		return
	}
	order.ViewerCanManage = true
	response.Success(w, http.StatusOK, order, nil)
}

// ListOrderEmails returns the emails sent to the customer about an order.
func (h *CheckoutHandler) ListOrderEmails(w http.ResponseWriter, r *http.Request) {
	order, ok := h.loadOrder(w, r, chi.URLParam(r, "orderNumber"), accessViewer)
	if !ok {
		return
	}
	msgs, err := h.checkoutService.ListOrderEmails(r.Context(), order.ID)
	if err != nil {
		slog.Error("order emails failed", "order", order.OrderNumber, "error", err)
		response.InternalServerError(w, "failed to load emails")
		return
	}
	response.Success(w, http.StatusOK, msgs, nil)
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

// ListMyOrders returns the signed-in user's orders, newest first.
func (h *CheckoutHandler) ListMyOrders(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		response.Unauthorized(w, "authentication required")
		return
	}
	orders, err := h.checkoutService.ListOrdersForUser(r.Context(), user.ID)
	if err != nil {
		slog.Error("account orders failed", "user_id", user.ID, "error", err)
		response.InternalServerError(w, "failed to load orders")
		return
	}
	if orders == nil {
		orders = []models.Order{}
	}
	response.Success(w, http.StatusOK, orders, nil)
}
