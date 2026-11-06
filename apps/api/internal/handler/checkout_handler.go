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

// Reserve godoc
//
//	@Summary		Reserve the bag and open an order
//	@Description	Turns the current bag (of the signed-in customer, or of the guest session) into a PENDING_PAYMENT order and holds its stock for 15 minutes.
//	@Description	When signed in and `customer_email` is empty, the account email is used. Pay with POST /checkout/pay before the reservation expires.
//	@Tags			Checkout
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			body	body		dto.CheckoutReserveRequest	true	"Contact email, shipping address and payment method (PROMPTPAY_QR, CREDIT_CARD, INSTALLMENT_0)"
//	@Success		201		{object}	response.Envelope{data=dto.CheckoutReserveResponse}
//	@Failure		400		{object}	response.Envelope	"BAD_REQUEST (invalid body or empty bag) or VALIDATION_FAILED (error.fields.customer_email)"
//	@Failure		409		{object}	response.Envelope	"PRODUCT_UNAVAILABLE or INSUFFICIENT_STOCK"
//	@Failure		500		{object}	response.Envelope
//	@Router			/checkout/reserve [post]
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

// Pay godoc
//
//	@Summary		Pay for a reserved order
//	@Description	Processes the simulated payment for a PENDING_PAYMENT order placed by the same customer or guest session. On success the reserved stock is committed,
//	@Description	the order moves to PAID_PROCESSING and the order-confirmation email is written. Card numbers ending in 0000 are declined (402) and the reservation is kept.
//	@Description	INSTALLMENT_0 requires `installment_plan` with bank KBANK, SCB, KRUNGSRI or BBL and 3, 6 or 10 months.
//	@Tags			Checkout
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			body	body		dto.PaymentProcessRequest	true	"Order number, payment method and card or installment details"
//	@Success		200		{object}	response.Envelope{data=models.Order}
//	@Failure		400		{object}	response.Envelope	"BAD_REQUEST: invalid body, missing order_number, unsupported method, invalid installment plan or order not payable"
//	@Failure		402		{object}	response.Envelope	"CARD_DECLINED_INSUFFICIENT_FUNDS"
//	@Failure		404		{object}	response.Envelope	"Order not found or not placed by this customer"
//	@Failure		409		{object}	response.Envelope	"RESERVATION_EXPIRED"
//	@Failure		500		{object}	response.Envelope
//	@Router			/checkout/pay [post]
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

// GetPromptPayQR godoc
//
//	@Summary		Get the PromptPay QR for an order
//	@Description	Returns the PromptPay payload and a QR code image (data URL) for the order total. Only the customer or guest session that placed the order may request it.
//	@Tags			Checkout
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			orderNumber	path		string	true	"Order number"
//	@Success		200			{object}	response.Envelope{data=dto.PromptPayQRResponse}
//	@Failure		400			{object}	response.Envelope
//	@Failure		404			{object}	response.Envelope	"Order not found or not placed by this customer"
//	@Failure		500			{object}	response.Envelope
//	@Router			/checkout/promptpay/{orderNumber} [get]
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

// GetOrder godoc
//
//	@Summary		Get an order
//	@Description	Returns the order with its items. Visible to the customer or guest session that placed it, to admins, and to anyone sending the order email in `X-Order-Email`.
//	@Description	`viewer_can_manage` is true only for the customer or guest session that placed it. Orders the requester may not see return 404.
//	@Tags			Orders
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			orderNumber		path		string	true	"Order number"
//	@Param			X-Order-Email	header		string	false	"Email the order was placed with (from an order lookup)"
//	@Success		200				{object}	response.Envelope{data=models.Order}
//	@Failure		400				{object}	response.Envelope
//	@Failure		404				{object}	response.Envelope
//	@Failure		500				{object}	response.Envelope
//	@Router			/orders/{orderNumber} [get]
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

// LookupOrder godoc
//
//	@Summary		Look up an order by number and email
//	@Description	Finds an order by its number and the email it was placed with, for customers who checked out as guests or on another device.
//	@Description	`viewer_can_manage` is true only when the requester also placed the order.
//	@Tags			Orders
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			body	body		dto.OrderLookupRequest	true	"Order number and email"
//	@Success		200		{object}	response.Envelope{data=models.Order}
//	@Failure		400		{object}	response.Envelope	"BAD_REQUEST (invalid body) or VALIDATION_FAILED (error.fields.order_number, error.fields.email)"
//	@Failure		404		{object}	response.Envelope	"No order with that number and email"
//	@Failure		500		{object}	response.Envelope
//	@Router			/orders/lookup [post]
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

// CancelOrder godoc
//
//	@Summary		Cancel an unpaid order
//	@Description	Lets the customer or guest session that placed a PENDING_PAYMENT order cancel it, releasing its reserved stock.
//	@Tags			Orders
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			orderNumber	path		string	true	"Order number"
//	@Success		200			{object}	response.Envelope{data=models.Order}
//	@Failure		404			{object}	response.Envelope	"Order not found or not placed by this customer"
//	@Failure		409			{object}	response.Envelope	"ORDER_NOT_CANCELLABLE (already paid or already cancelled)"
//	@Failure		500			{object}	response.Envelope
//	@Router			/orders/{orderNumber}/cancel [post]
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

// ListOrderEmails godoc
//
//	@Summary		List emails sent about an order
//	@Description	Returns the emails sent to the customer about the order (confirmation, shipping and so on), newest first.
//	@Description	Same visibility as GET /orders/{orderNumber}: the customer or guest session that placed it, admins, or a matching `X-Order-Email`.
//	@Tags			Orders
//	@Produce		json
//	@Security		BearerAuth
//	@Security		GuestSession
//	@Param			orderNumber		path		string	true	"Order number"
//	@Param			X-Order-Email	header		string	false	"Email the order was placed with (from an order lookup)"
//	@Success		200				{object}	response.Envelope{data=[]models.EmailMessage}
//	@Failure		404				{object}	response.Envelope
//	@Failure		500				{object}	response.Envelope
//	@Router			/orders/{orderNumber}/emails [get]
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

// CalculateInstallments godoc
//
//	@Summary		Calculate 0% installment options
//	@Description	Returns the monthly payment for each supported bank and term (3, 6 or 10 months) for the given amount.
//	@Tags			Checkout
//	@Produce		json
//	@Param			satangAmount	path		integer	true	"Amount in satang (greater than 0)"
//	@Success		200				{object}	response.Envelope{data=[]dto.InstallmentCalculationOption}
//	@Failure		400				{object}	response.Envelope
//	@Router			/checkout/installments/{satangAmount} [get]
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

// ListMyOrders godoc
//
//	@Summary		List my orders
//	@Description	Returns every order of the signed-in customer, newest first.
//	@Tags			Account
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=[]models.Order}
//	@Failure		401	{object}	response.Envelope
//	@Failure		500	{object}	response.Envelope
//	@Router			/account/orders [get]
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
