package handler

import (
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

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// EngagementHandler serves back-in-stock alerts, the account inbox and product reviews.
type EngagementHandler struct {
	svc   service.EngagementService
	audit service.AuditService
}

func NewEngagementHandler(svc service.EngagementService, audit service.AuditService) *EngagementHandler {
	return &EngagementHandler{svc: svc, audit: audit}
}

func (h *EngagementHandler) fail(w http.ResponseWriter, err error, action string) {
	var ve *service.ValidationError
	switch {
	case errors.As(err, &ve):
		response.ValidationFailed(w, "Some fields need attention.", ve.Fields)
	case errors.Is(err, repository.ErrVariantNotFound):
		response.NotFound(w, "product option not found")
	case errors.Is(err, repository.ErrProductNotFound):
		response.NotFound(w, "product not found")
	case errors.Is(err, repository.ErrReviewNotFound):
		response.NotFound(w, "review not found")
	case errors.Is(err, repository.ErrVariantInStock):
		response.Conflict(w, "IN_STOCK", "This option is in stock. Add it to your bag.")
	case errors.Is(err, repository.ErrReviewNotAllowed):
		response.Error(w, http.StatusForbidden, "REVIEW_NOT_ALLOWED", "You can review this product once your order has been delivered.")
	default:
		slog.Error(action+" failed", "error", err)
		response.InternalServerError(w, "could not "+action)
	}
}

// signedIn returns the requester's user ID, or writes 401.
func signedIn(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		response.Unauthorized(w, "sign in to continue")
		return uuid.Nil, false
	}
	return user.ID, true
}

func pageParams(r *http.Request, defLimit, maxLimit int) (int, int) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > maxLimit {
		limit = defLimit
	}
	return page, limit
}

func pageMeta(page, limit int, total int64) *response.Meta {
	pages := int((total + int64(limit) - 1) / int64(limit))
	return &response.Meta{Page: page, Limit: limit, TotalItems: int(total), TotalPages: pages}
}

// ---------------------------------------------------------------- stock alerts & inbox

// ListStockAlerts godoc
//
//	@Summary	List back-in-stock alerts
//	@Tags		Account
//	@Produce	json
//	@Security	BearerAuth
//	@Success	200	{object}	response.Envelope{data=[]dto.StockAlertView}
//	@Failure	401	{object}	response.Envelope
//	@Failure	500	{object}	response.Envelope
//	@Router		/account/stock-alerts [get]
func (h *EngagementHandler) ListStockAlerts(w http.ResponseWriter, r *http.Request) {
	userID, ok := signedIn(w, r)
	if !ok {
		return
	}
	rows, err := h.svc.ListStockAlerts(r.Context(), userID)
	if err != nil {
		h.fail(w, err, "list alerts")
		return
	}
	response.Success(w, http.StatusOK, rows, nil)
}

func (h *EngagementHandler) variantParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "variantID"))
	if err != nil {
		response.NotFound(w, "product option not found")
		return uuid.Nil, false
	}
	return id, true
}

// SubscribeStockAlert godoc
//
//	@Summary		Subscribe to a back-in-stock alert
//	@Description	Emails the customer when the out-of-stock option is restocked. Subscribing again while an alert is pending has no effect. Returns `{ "message": string }`.
//	@Tags			Account
//	@Produce		json
//	@Security		BearerAuth
//	@Param			variantID	path		string	true	"Variant ID (UUID)"
//	@Success		200			{object}	response.Envelope{data=object}
//	@Failure		401			{object}	response.Envelope
//	@Failure		404			{object}	response.Envelope	"Product option not found"
//	@Failure		409			{object}	response.Envelope	"IN_STOCK"
//	@Failure		500			{object}	response.Envelope
//	@Router			/account/stock-alerts/{variantID} [put]
func (h *EngagementHandler) SubscribeStockAlert(w http.ResponseWriter, r *http.Request) {
	userID, ok := signedIn(w, r)
	if !ok {
		return
	}
	variantID, ok := h.variantParam(w, r)
	if !ok {
		return
	}
	if err := h.svc.SubscribeStockAlert(r.Context(), userID, variantID); err != nil {
		h.fail(w, err, "create alert")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "We'll email you when it's back."}, nil)
}

// UnsubscribeStockAlert godoc
//
//	@Summary		Cancel a back-in-stock alert
//	@Description	Returns `{ "message": string }`. Succeeds even when no alert was pending.
//	@Tags			Account
//	@Produce		json
//	@Security		BearerAuth
//	@Param			variantID	path		string	true	"Variant ID (UUID)"
//	@Success		200			{object}	response.Envelope{data=object}
//	@Failure		401			{object}	response.Envelope
//	@Failure		404			{object}	response.Envelope	"Invalid variant ID"
//	@Failure		500			{object}	response.Envelope
//	@Router			/account/stock-alerts/{variantID} [delete]
func (h *EngagementHandler) UnsubscribeStockAlert(w http.ResponseWriter, r *http.Request) {
	userID, ok := signedIn(w, r)
	if !ok {
		return
	}
	variantID, ok := h.variantParam(w, r)
	if !ok {
		return
	}
	if err := h.svc.UnsubscribeStockAlert(r.Context(), userID, variantID); err != nil {
		h.fail(w, err, "cancel alert")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "Alert cancelled."}, nil)
}

// ListAccountEmails godoc
//
//	@Summary		List account emails
//	@Description	Returns the 50 most recent emails sent to the signed-in customer, newest first.
//	@Tags			Account
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=[]models.EmailMessage}
//	@Failure		401	{object}	response.Envelope
//	@Failure		500	{object}	response.Envelope
//	@Router			/account/emails [get]
func (h *EngagementHandler) ListAccountEmails(w http.ResponseWriter, r *http.Request) {
	userID, ok := signedIn(w, r)
	if !ok {
		return
	}
	msgs, err := h.svc.ListAccountEmails(r.Context(), userID)
	if err != nil {
		h.fail(w, err, "load inbox")
		return
	}
	response.Success(w, http.StatusOK, msgs, nil)
}

// ---------------------------------------------------------------- reviews

// ProductReviews godoc
//
//	@Summary		List a product's reviews
//	@Description	Returns the rating summary and one page of visible reviews. When signed in, data.viewer says whether the customer can review the product and includes their own review (even if hidden); it is null for guests. meta carries pagination (page, limit, total_items, total_pages).
//	@Tags			Reviews
//	@Produce		json
//	@Security		BearerAuth
//	@Param			slug	path		string	true	"Product slug"
//	@Param			page	query		int		false	"Page number"			default(1)	minimum(1)
//	@Param			limit	query		int		false	"Page size (max 20)"	default(5)	minimum(1)	maximum(20)
//	@Success		200		{object}	response.Envelope{data=dto.ProductReviews}
//	@Failure		404		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/products/{slug}/reviews [get]
func (h *EngagementHandler) ProductReviews(w http.ResponseWriter, r *http.Request) {
	page, limit := pageParams(r, 5, 20)
	var viewer *uuid.UUID
	if user := middleware.GetUserFromContext(r.Context()); user != nil {
		viewer = &user.ID
	}
	out, total, err := h.svc.ProductReviews(r.Context(), chi.URLParam(r, "slug"), page, limit, viewer)
	if err != nil {
		h.fail(w, err, "load reviews")
		return
	}
	response.Success(w, http.StatusOK, out, pageMeta(page, limit, total))
}

// SaveReview godoc
//
//	@Summary		Write or update my review
//	@Description	Creates or replaces the signed-in customer's review. Allowed only after an order containing the product has been delivered. Rating 1 to 5, title up to 120 characters, body up to 2,000 characters. Returns `{ "message": string }`.
//	@Tags			Reviews
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			slug	path		string			true	"Product slug"
//	@Param			body	body		dto.ReviewInput	true	"Review"
//	@Success		200		{object}	response.Envelope{data=object}
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED with per-field error.fields, or invalid body"
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope	"REVIEW_NOT_ALLOWED"
//	@Failure		404		{object}	response.Envelope	"Product not found"
//	@Failure		500		{object}	response.Envelope
//	@Router			/products/{slug}/reviews/mine [put]
func (h *EngagementHandler) SaveReview(w http.ResponseWriter, r *http.Request) {
	userID, ok := signedIn(w, r)
	if !ok {
		return
	}
	var in dto.ReviewInput
	if !decode(w, r, &in) {
		return
	}
	if err := h.svc.SaveReview(r.Context(), chi.URLParam(r, "slug"), userID, in); err != nil {
		h.fail(w, err, "save review")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "Thanks for your review."}, nil)
}

// DeleteReview godoc
//
//	@Summary		Delete my review
//	@Description	Returns `{ "message": string }`.
//	@Tags			Reviews
//	@Produce		json
//	@Security		BearerAuth
//	@Param			slug	path		string	true	"Product slug"
//	@Success		200		{object}	response.Envelope{data=object}
//	@Failure		401		{object}	response.Envelope
//	@Failure		404		{object}	response.Envelope	"Product or review not found"
//	@Failure		500		{object}	response.Envelope
//	@Router			/products/{slug}/reviews/mine [delete]
func (h *EngagementHandler) DeleteReview(w http.ResponseWriter, r *http.Request) {
	userID, ok := signedIn(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteReview(r.Context(), chi.URLParam(r, "slug"), userID); err != nil {
		h.fail(w, err, "delete review")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "Review deleted."}, nil)
}

// ListReviewsAdmin godoc
//
//	@Summary		List reviews (admin)
//	@Description	Returns reviews newest first, including hidden ones. Requires an admin account. meta carries pagination (page, limit, total_items, total_pages).
//	@Tags			Admin · Reviews
//	@Produce		json
//	@Security		BearerAuth
//	@Param			status	query		string	false	"Visibility filter; all reviews when omitted"	Enums(visible, hidden)
//	@Param			rating	query		int		false	"Star rating"									minimum(1)	maximum(5)
//	@Param			q		query		string	false	"Matches product name, author email, review title or body"
//	@Param			page	query		int		false	"Page number"			default(1)	minimum(1)
//	@Param			limit	query		int		false	"Page size (max 100)"	default(20)	minimum(1)	maximum(100)
//	@Success		200		{object}	response.Envelope{data=[]dto.AdminReview}
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/reviews [get]
func (h *EngagementHandler) ListReviewsAdmin(w http.ResponseWriter, r *http.Request) {
	page, limit := pageParams(r, 20, 100)
	q := r.URL.Query()
	rating, _ := strconv.Atoi(q.Get("rating"))
	filter := dto.AdminReviewFilter{
		Status: strings.ToLower(q.Get("status")),
		Rating: rating,
		Search: strings.TrimSpace(q.Get("q")),
		Page:   page,
		Limit:  limit,
	}
	rows, total, err := h.svc.ListReviewsAdmin(r.Context(), filter)
	if err != nil {
		h.fail(w, err, "list reviews")
		return
	}
	response.Success(w, http.StatusOK, rows, pageMeta(page, limit, total))
}

// SetReviewHidden godoc
//
//	@Summary		Hide or show a review (admin)
//	@Description	Body is `{ "is_hidden": boolean }`. Hidden reviews are left out of the storefront list and rating summary; the author still sees their own review. Records an activity log entry. Requires an admin account. Returns `{ "is_hidden": boolean }`.
//	@Tags			Admin · Reviews
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string	true	"Review ID (UUID)"
//	@Param			body	body		object	true	"Object with is_hidden (boolean)"
//	@Success		200		{object}	response.Envelope{data=object}
//	@Failure		400		{object}	response.Envelope
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		404		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/reviews/{id} [patch]
func (h *EngagementHandler) SetReviewHidden(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var req struct {
		IsHidden bool `json:"is_hidden"`
	}
	if !decode(w, r, &req) {
		return
	}
	if err := h.svc.SetReviewHidden(r.Context(), id, req.IsHidden); err != nil {
		h.fail(w, err, "update review")
		return
	}
	label, _ := h.svc.ReviewLabel(r.Context(), id)
	action, from, to := "review.hide", "Visible", "Hidden"
	if !req.IsHidden {
		action, from, to = "review.show", "Hidden", "Visible"
	}
	h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
		Action: action, EntityType: "review", EntityID: id.String(), EntityLabel: label,
		Changes: []models.AuditChange{{Field: "visibility", From: from, To: to}},
	})
	response.Success(w, http.StatusOK, map[string]bool{"is_hidden": req.IsHidden}, nil)
}
