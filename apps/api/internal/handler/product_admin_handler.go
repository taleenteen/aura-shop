package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
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

const maxImageBytes = 5 << 20 // 5 MB

var imageExtensions = map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}

type ProductAdminHandler struct {
	service service.ProductAdminService
	audit   service.AuditService
	upload  func(r *http.Request, objectName string, body io.Reader, size int64, contentType string) (string, error)
}

// NewProductAdminHandler wires the admin product endpoints. upload may be nil when object
// storage is unavailable; uploads then answer 503.
func NewProductAdminHandler(svc service.ProductAdminService, audit service.AuditService, upload func(r *http.Request, objectName string, body io.Reader, size int64, contentType string) (string, error)) *ProductAdminHandler {
	return &ProductAdminHandler{service: svc, audit: audit, upload: upload}
}

func actorFrom(r *http.Request) repository.Actor {
	if u := middleware.GetUserFromContext(r.Context()); u != nil {
		return repository.Actor{ID: u.ID, Email: u.Email}
	}
	return repository.Actor{}
}

func (h *ProductAdminHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	status := q.Get("status")
	if status != "active" && status != "inactive" {
		status = ""
	}
	rows, total, err := h.service.ListProducts(r.Context(), dto.AdminProductListFilter{
		Search: strings.TrimSpace(q.Get("q")), Category: q.Get("category"), Status: status, Page: page, Limit: limit,
	})
	if err != nil {
		slog.Error("admin product list failed", "error", err)
		response.InternalServerError(w, "failed to list products")
		return
	}
	response.Success(w, http.StatusOK, rows, &response.Meta{
		Page: page, Limit: limit, TotalItems: int(total), TotalPages: int(math.Ceil(float64(total) / float64(limit))),
	})
}

func (h *ProductAdminHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	p, err := h.service.GetProduct(r.Context(), id)
	if err != nil {
		h.fail(w, err, "load product")
		return
	}
	response.Success(w, http.StatusOK, p, nil)
}

func (h *ProductAdminHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var in dto.ProductInput
	if err := decodeStrict(r, &in); err != nil {
		response.BadRequest(w, "invalid request body: "+err.Error())
		return
	}
	p, err := h.service.CreateProduct(r.Context(), in, actorFrom(r))
	if err != nil {
		h.fail(w, err, "create product")
		return
	}
	h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
		Action: "product.create", EntityType: "product", EntityID: p.ID.String(), EntityLabel: p.Name,
		Changes: service.Diff(nil, service.ProductSnapshot(p)),
	})
	response.Success(w, http.StatusCreated, p, nil)
}

func (h *ProductAdminHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var in dto.ProductInput
	if err := decodeStrict(r, &in); err != nil {
		response.BadRequest(w, "invalid request body: "+err.Error())
		return
	}
	before, _ := h.service.GetProduct(r.Context(), id)
	p, err := h.service.UpdateProduct(r.Context(), id, in, actorFrom(r))
	if err != nil {
		h.fail(w, err, "update product")
		return
	}
	if changes := service.Diff(service.ProductSnapshot(before), service.ProductSnapshot(p)); len(changes) > 0 {
		h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
			Action: "product.update", EntityType: "product", EntityID: p.ID.String(), EntityLabel: p.Name, Changes: changes,
		})
	}
	response.Success(w, http.StatusOK, p, nil)
}

func (h *ProductAdminHandler) SetStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var req dto.ProductStatusRequest
	if err := decodeStrict(r, &req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	before, _ := h.service.GetProduct(r.Context(), id)
	if err := h.service.SetActive(r.Context(), id, req.IsActive); err != nil {
		h.fail(w, err, "update product status")
		return
	}
	if before != nil && before.IsActive != req.IsActive {
		action := "product.hide"
		if req.IsActive {
			action = "product.show"
		}
		h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
			Action: action, EntityType: "product", EntityID: id.String(), EntityLabel: before.Name,
			Changes: []models.AuditChange{{Field: "on_sale", From: yesNo(before.IsActive), To: yesNo(req.IsActive)}},
		})
	}
	response.Success(w, http.StatusOK, map[string]bool{"is_active": req.IsActive}, nil)
}

func (h *ProductAdminHandler) AdjustStock(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var req dto.StockAdjustmentRequest
	if err := decodeStrict(r, &req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	res, err := h.service.AdjustStock(r.Context(), id, req, actorFrom(r))
	if err != nil {
		h.fail(w, err, "adjust stock")
		return
	}
	h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
		Action: "stock.adjust", EntityType: "variant", EntityID: id.String(), EntityLabel: res.SKU,
		Changes: []models.AuditChange{
			{Field: "stock", From: strconv.Itoa(res.StockQuantity - res.Delta), To: strconv.Itoa(res.StockQuantity)},
			{Field: "reason", To: strings.ToUpper(strings.TrimSpace(req.Reason))},
			{Field: "note", To: strings.TrimSpace(req.Note)},
		},
	})
	response.Success(w, http.StatusOK, res, nil)
}

func (h *ProductAdminHandler) ListMovements(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	rows, err := h.service.ListMovements(r.Context(), id)
	if err != nil {
		h.fail(w, err, "load stock history")
		return
	}
	if rows == nil {
		rows = []models.StockMovement{}
	}
	response.Success(w, http.StatusOK, rows, nil)
}

// UploadImage accepts one PNG, JPEG or WebP (max 5 MB) as multipart field "file".
func (h *ProductAdminHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	if h.upload == nil {
		response.Error(w, http.StatusServiceUnavailable, "STORAGE_UNAVAILABLE", "Image storage is not available right now.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+64<<10)
	file, header, err := r.FormFile("file")
	if err != nil {
		response.ValidationFailed(w, "Choose an image up to 5 MB.", map[string]string{"file": "Choose an image up to 5 MB."})
		return
	}
	defer file.Close()
	if header.Size > maxImageBytes {
		response.ValidationFailed(w, "Images must be 5 MB or smaller.", map[string]string{"file": "Images must be 5 MB or smaller."})
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if err != nil || len(data) > maxImageBytes {
		response.ValidationFailed(w, "Images must be 5 MB or smaller.", map[string]string{"file": "Images must be 5 MB or smaller."})
		return
	}
	// Trust the bytes, not the file name or the browser's declared type.
	contentType := http.DetectContentType(data)
	ext, ok := imageExtensions[contentType]
	if !ok {
		response.ValidationFailed(w, "Only PNG, JPEG or WebP images.", map[string]string{"file": "Only PNG, JPEG or WebP images."})
		return
	}
	url, err := h.upload(r, "products/"+uuid.NewString()+"."+ext, bytes.NewReader(data), int64(len(data)), contentType)
	if err != nil {
		slog.Error("image upload failed", "error", err)
		response.Error(w, http.StatusBadGateway, "UPLOAD_FAILED", "The image could not be stored. Try again.")
		return
	}
	response.Success(w, http.StatusCreated, dto.UploadResponse{URL: url}, nil)
}

func (h *ProductAdminHandler) fail(w http.ResponseWriter, err error, action string) {
	var ve *service.ValidationError
	switch {
	case errors.As(err, &ve):
		response.ValidationFailed(w, "Some fields need attention.", ve.Fields)
	case errors.Is(err, repository.ErrProductNotFound):
		response.NotFound(w, "product not found")
	case errors.Is(err, repository.ErrVariantNotFound):
		response.NotFound(w, err.Error())
	case errors.Is(err, repository.ErrVariantInUse):
		response.Error(w, http.StatusConflict, "VARIANT_IN_USE", strings.TrimPrefix(err.Error(), repository.ErrVariantInUse.Error()+": "))
	case errors.Is(err, repository.ErrStockChanged):
		response.Error(w, http.StatusConflict, "STOCK_CHANGED", "Stock changed since you opened this. Reload and try again.")
	case errors.Is(err, repository.ErrInvalidStock):
		response.Error(w, http.StatusBadRequest, "INVALID_STOCK", strings.TrimPrefix(err.Error(), repository.ErrInvalidStock.Error()+": "))
	default:
		slog.Error("admin product action failed", "action", action, "error", err)
		response.InternalServerError(w, "failed to "+action)
	}
}

func parseID(w http.ResponseWriter, r *http.Request, param string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, param))
	if err != nil {
		response.BadRequest(w, "invalid id")
		return uuid.Nil, false
	}
	return id, true
}

// decodeStrict rejects unknown fields so a typo in the editor never silently drops data.
func decodeStrict(r *http.Request, v interface{}) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func yesNo(b bool) string {
	if b {
		return "Yes"
	}
	return "No"
}
