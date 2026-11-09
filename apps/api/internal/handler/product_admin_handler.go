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

// ListProducts godoc
//
//	@Summary		List products
//	@Description	Returns one page of products with category, brand, variant count, stock totals, low-stock count, lowest price and thumbnail. Pagination is returned in meta (page, limit, total_items, total_pages).
//	@Tags			Admin · Products
//	@Produce		json
//	@Security		BearerAuth
//	@Param			q			query		string	false	"Search by product name, slug or brand name"
//	@Param			category	query		string	false	"Category slug"
//	@Param			status		query		string	false	"active (on sale), inactive (hidden) or archived; anything else lists every product that is not archived"	Enums(active, inactive, archived)
//	@Param			page		query		int		false	"Page number (default 1)"																					minimum(1)
//	@Param			limit		query		int		false	"Page size, 1-100 (default 20)"																				minimum(1)	maximum(100)
//	@Success		200			{object}	response.Envelope{data=[]dto.AdminProductSummary}
//	@Failure		401			{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403			{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		500			{object}	response.Envelope
//	@Router			/admin/products [get]
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
	if status != "active" && status != "inactive" && status != "archived" {
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

// GetProduct godoc
//
//	@Summary		Get a product
//	@Description	Returns the full product with its category, brand and variants, for the admin editor.
//	@Tags			Admin · Products
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Product ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=models.Product}
//	@Failure		400	{object}	response.Envelope	"Invalid id"
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope	"Product not found"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/products/{id} [get]
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

// CreateProduct godoc
//
//	@Summary		Create a product
//	@Description	Creates a product with its variants. An empty slug is generated from the name. New variants may set initial_stock, which is written to the stock ledger as INITIAL. Unknown JSON fields are rejected. The change is written to the audit log.
//	@Tags			Admin · Products
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.ProductInput	true	"Product and variants"
//	@Success		201		{object}	response.Envelope{data=models.Product}
//	@Failure		400		{object}	response.Envelope	"Malformed body or unknown field"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields, e.g. slug already used, duplicate SKU, missing name or variants"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/products [post]
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

// UpdateProduct godoc
//
//	@Summary		Update a product
//	@Description	Replaces the product and its variants. Variants are matched by id; variants left out are removed, unless they are referenced by orders. Stock is not changed here (use stock adjustments), except initial_stock on new variants. Unknown JSON fields are rejected. Changed fields are written to the audit log.
//	@Tags			Admin · Products
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string				true	"Product ID"	Format(uuid)
//	@Param			body	body		dto.ProductInput	true	"Product and variants"
//	@Success		200		{object}	response.Envelope{data=models.Product}
//	@Failure		400		{object}	response.Envelope	"Invalid id, malformed body or unknown field"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Product or variant not found"
//	@Failure		409		{object}	response.Envelope	"VARIANT_IN_USE: a removed variant is referenced by orders"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields, e.g. slug already used, duplicate SKU"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/products/{id} [put]
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

// SetStatus godoc
//
//	@Summary		Show or hide a product
//	@Description	Puts the product on sale (is_active=true) or hides it from the store. Returns the new state as {"is_active": bool}. A real change is written to the audit log.
//	@Tags			Admin · Products
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string						true	"Product ID"	Format(uuid)
//	@Param			body	body		dto.ProductStatusRequest	true	"New status"
//	@Success		200		{object}	response.Envelope{data=object{is_active=bool}}
//	@Failure		400		{object}	response.Envelope	"Invalid id or body"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Product not found"
//	@Failure		409		{object}	response.Envelope	"PRODUCT_ARCHIVED: restore the product before putting it on sale"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/products/{id}/status [patch]
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

// ArchiveProduct godoc
//
//	@Summary		Archive a product
//	@Description	Takes the product off sale and out of the default product list (list it with status=archived). Orders, sales reports and stock history keep pointing at it, and it can be restored. Archiving an archived product does nothing. Written to the audit log.
//	@Tags			Admin · Products
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Product ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=models.Product}
//	@Failure		400	{object}	response.Envelope	"Invalid id"
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope	"Product not found"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/products/{id}/archive [post]
func (h *ProductAdminHandler) ArchiveProduct(w http.ResponseWriter, r *http.Request) {
	h.changeArchive(w, r, true)
}

// RestoreProduct godoc
//
//	@Summary		Restore an archived product
//	@Description	Brings the product back to the product list. It stays hidden from the store until it is put on sale again. Written to the audit log.
//	@Tags			Admin · Products
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Product ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=models.Product}
//	@Failure		400	{object}	response.Envelope	"Invalid id"
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope	"Product not found"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/products/{id}/restore [post]
func (h *ProductAdminHandler) RestoreProduct(w http.ResponseWriter, r *http.Request) {
	h.changeArchive(w, r, false)
}

func (h *ProductAdminHandler) changeArchive(w http.ResponseWriter, r *http.Request, archive bool) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	before, err := h.service.GetProduct(r.Context(), id)
	if err != nil {
		h.fail(w, err, "load product")
		return
	}
	action, verb := "product.restore", "restore product"
	change := h.service.RestoreProduct
	if archive {
		action, verb, change = "product.archive", "archive product", h.service.ArchiveProduct
	}
	if err := change(r.Context(), id); err != nil {
		h.fail(w, err, verb)
		return
	}
	after, err := h.service.GetProduct(r.Context(), id)
	if err != nil {
		h.fail(w, err, "load product")
		return
	}
	if (before.ArchivedAt != nil) != (after.ArchivedAt != nil) {
		changes := []models.AuditChange{{Field: "archived", From: yesNo(before.ArchivedAt != nil), To: yesNo(after.ArchivedAt != nil)}}
		if before.IsActive != after.IsActive {
			changes = append(changes, models.AuditChange{Field: "on_sale", From: yesNo(before.IsActive), To: yesNo(after.IsActive)})
		}
		h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
			Action: action, EntityType: "product", EntityID: id.String(), EntityLabel: before.Name, Changes: changes,
		})
	}
	response.Success(w, http.StatusOK, after, nil)
}

// DeleteProduct godoc
//
//	@Summary		Delete a product permanently
//	@Description	Removes a product that has never been ordered, with its variants, bag lines, wishlist hearts, stock alerts, stock history, reviews and bundle links. A product on any order or checkout hold answers 409 PRODUCT_HAS_ORDERS: archive it instead. Images stay in storage. Written to the audit log.
//	@Tags			Admin · Products
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Product ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=object{deleted=bool}}
//	@Failure		400	{object}	response.Envelope	"Invalid id"
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope	"Product not found"
//	@Failure		409	{object}	response.Envelope	"PRODUCT_HAS_ORDERS"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/products/{id} [delete]
func (h *ProductAdminHandler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	before, err := h.service.GetProduct(r.Context(), id)
	if err != nil {
		h.fail(w, err, "load product")
		return
	}
	if err := h.service.DeleteProduct(r.Context(), id); err != nil {
		h.fail(w, err, "delete product")
		return
	}
	skus := make([]string, 0, len(before.Variants))
	for _, v := range before.Variants {
		skus = append(skus, v.SKU)
	}
	h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
		Action: "product.delete", EntityType: "product", EntityID: id.String(), EntityLabel: before.Name,
		Changes: []models.AuditChange{
			{Field: "slug", From: before.Slug, To: ""},
			{Field: "skus", From: strings.Join(skus, ", "), To: ""},
		},
	})
	response.Success(w, http.StatusOK, map[string]bool{"deleted": true}, nil)
}

// AdjustStock godoc
//
//	@Summary		Adjust a variant's stock
//	@Description	Changes one variant's physical stock. mode "delta" adds quantity (may be negative, not 0); mode "set" makes stock equal quantity (a physical count). reason is one of RECEIVE, COUNT, DAMAGE or RETURN; a note is required for COUNT and DAMAGE (max 500 characters). Pass expected_stock (the stock you saw) to refuse the change if stock moved since. Stock cannot go below zero or below units held in checkout. Every change appends to the stock ledger, may send back-in-stock emails to waiting customers, and is written to the audit log.
//	@Tags			Admin · Stock
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string						true	"Variant ID"	Format(uuid)
//	@Param			body	body		dto.StockAdjustmentRequest	true	"Adjustment"
//	@Success		200		{object}	response.Envelope{data=dto.StockAdjustmentResponse}
//	@Failure		400		{object}	response.Envelope	"Invalid id or body; INVALID_STOCK when stock would go below zero or below reserved units"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Variant not found"
//	@Failure		409		{object}	response.Envelope	"STOCK_CHANGED: stock differs from expected_stock"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields (mode, quantity, reason, note)"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/variants/{id}/stock-adjustments [post]
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

// ListMovements godoc
//
//	@Summary		List a variant's stock history
//	@Description	Returns the latest 50 stock ledger entries for the variant, newest first: manual adjustments, initial stock, sales and cancellation restocks.
//	@Tags			Admin · Stock
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Variant ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=[]models.StockMovement}
//	@Failure		400	{object}	response.Envelope	"Invalid id"
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope	"Variant not found"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/variants/{id}/stock-movements [get]
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

// UploadImage godoc
//
//	@Summary		Upload a product image
//	@Description	Stores one PNG, JPEG or WebP image (max 5 MB) and returns its public URL. The type is detected from the file contents, not its name.
//	@Tags			Admin · Uploads
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		BearerAuth
//	@Param			file	formData	file	true	"PNG, JPEG or WebP image, max 5 MB"
//	@Success		201		{object}	response.Envelope{data=dto.UploadResponse}
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields (file: missing, too large or not an image)"
//	@Failure		502		{object}	response.Envelope	"UPLOAD_FAILED: storage rejected the file"
//	@Failure		503		{object}	response.Envelope	"STORAGE_UNAVAILABLE: image storage is not configured"
//	@Router			/admin/uploads/images [post]
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
	case errors.Is(err, repository.ErrProductArchived):
		response.Error(w, http.StatusConflict, "PRODUCT_ARCHIVED", "This product is archived. Restore it before putting it on sale.")
	case errors.Is(err, repository.ErrProductHasOrders):
		response.Error(w, http.StatusConflict, "PRODUCT_HAS_ORDERS", "This product is on past orders, so it can't be deleted. Archive it instead: it leaves the store and this list, and your order history stays complete.")
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
