package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// EngagementHandler serves back-in-stock alerts, the account inbox and product reviews.
type EngagementHandler struct {
	svc service.EngagementService
}

func NewEngagementHandler(svc service.EngagementService) *EngagementHandler {
	return &EngagementHandler{svc: svc}
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
	response.Success(w, http.StatusOK, map[string]bool{"is_hidden": req.IsHidden}, nil)
}
