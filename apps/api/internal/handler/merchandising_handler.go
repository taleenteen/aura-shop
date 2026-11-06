package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// MerchandisingHandler serves the admin endpoints for banners, categories and brands.
type MerchandisingHandler struct {
	svc   service.MerchandisingService
	audit service.AuditService
}

func NewMerchandisingHandler(svc service.MerchandisingService, audit service.AuditService) *MerchandisingHandler {
	return &MerchandisingHandler{svc: svc, audit: audit}
}

func (h *MerchandisingHandler) fail(w http.ResponseWriter, err error, action string) {
	var ve *service.ValidationError
	switch {
	case errors.As(err, &ve):
		response.ValidationFailed(w, "Some fields need attention.", ve.Fields)
	case errors.Is(err, repository.ErrBannerNotFound):
		response.NotFound(w, "banner not found")
	case errors.Is(err, repository.ErrCategoryNotFound):
		response.NotFound(w, "category not found")
	case errors.Is(err, repository.ErrBrandNotFound):
		response.NotFound(w, "brand not found")
	case errors.Is(err, repository.ErrTaxonomyInUse):
		n := strings.TrimPrefix(err.Error(), repository.ErrTaxonomyInUse.Error()+": ")
		response.Conflict(w, "IN_USE", "Move or delete its "+n+" first.")
	default:
		slog.Error(action+" failed", "error", err)
		response.InternalServerError(w, "could not "+action)
	}
}

func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid id")
		return uuid.Nil, false
	}
	return id, true
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		response.BadRequest(w, "invalid request body")
		return false
	}
	return true
}

// record writes an audit entry when something changed.
func (h *MerchandisingHandler) record(r *http.Request, action, kind, id, label string, before, after service.Snapshot) {
	if changes := service.Diff(before, after); len(changes) > 0 {
		h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{Action: action, EntityType: kind, EntityID: id, EntityLabel: label, Changes: changes})
	}
}

// ---------------------------------------------------------------- banners

// ListBanners godoc
//
//	@Summary		List banners
//	@Description	Returns every banner, including inactive and scheduled ones.
//	@Tags			Admin · Banners
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=[]models.Banner}
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/banners [get]
func (h *MerchandisingHandler) ListBanners(w http.ResponseWriter, r *http.Request) {
	banners, err := h.svc.ListBanners(r.Context())
	if err != nil {
		h.fail(w, err, "list banners")
		return
	}
	response.Success(w, http.StatusOK, banners, nil)
}

// CreateBanner godoc
//
//	@Summary		Create a banner
//	@Description	Creates a home-page banner. start_at and end_at are RFC 3339. The change is written to the audit log.
//	@Tags			Admin · Banners
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.BannerInput	true	"Banner"
//	@Success		201		{object}	response.Envelope{data=models.Banner}
//	@Failure		400		{object}	response.Envelope	"Invalid body"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/banners [post]
func (h *MerchandisingHandler) CreateBanner(w http.ResponseWriter, r *http.Request) {
	var in dto.BannerInput
	if !decode(w, r, &in) {
		return
	}
	b, err := h.svc.CreateBanner(r.Context(), in)
	if err != nil {
		h.fail(w, err, "create banner")
		return
	}
	h.record(r, "banner.create", "banner", b.ID.String(), b.Headline, nil, service.BannerSnapshot(b))
	response.Success(w, http.StatusCreated, b, nil)
}

// UpdateBanner godoc
//
//	@Summary		Update a banner
//	@Description	Replaces the banner. Changed fields are written to the audit log.
//	@Tags			Admin · Banners
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string			true	"Banner ID"	Format(uuid)
//	@Param			body	body		dto.BannerInput	true	"Banner"
//	@Success		200		{object}	response.Envelope{data=models.Banner}
//	@Failure		400		{object}	response.Envelope	"Invalid body or malformed id"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Banner not found"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/banners/{id} [put]
func (h *MerchandisingHandler) UpdateBanner(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in dto.BannerInput
	if !decode(w, r, &in) {
		return
	}
	before, _ := h.svc.GetBanner(r.Context(), id)
	b, err := h.svc.UpdateBanner(r.Context(), id, in)
	if err != nil {
		h.fail(w, err, "update banner")
		return
	}
	h.record(r, "banner.update", "banner", b.ID.String(), b.Headline, service.BannerSnapshot(before), service.BannerSnapshot(b))
	response.Success(w, http.StatusOK, b, nil)
}

// SetBannerStatus godoc
//
//	@Summary		Turn a banner on or off
//	@Description	Sets is_active and returns the new state. The change is written to the audit log.
//	@Tags			Admin · Banners
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string				true	"Banner ID"	Format(uuid)
//	@Param			body	body		dto.BannerStatus	true	"New state"
//	@Success		200		{object}	response.Envelope{data=dto.BannerStatus}
//	@Failure		400		{object}	response.Envelope	"Invalid body or malformed id"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Banner not found"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/banners/{id}/status [patch]
func (h *MerchandisingHandler) SetBannerStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var req dto.BannerStatus
	if !decode(w, r, &req) {
		return
	}
	before, _ := h.svc.GetBanner(r.Context(), id)
	if err := h.svc.SetBannerActive(r.Context(), id, req.IsActive); err != nil {
		h.fail(w, err, "update banner")
		return
	}
	if before != nil {
		after := *before
		after.IsActive = req.IsActive
		action := "banner.off"
		if req.IsActive {
			action = "banner.on"
		}
		h.record(r, action, "banner", id.String(), before.Headline, service.BannerSnapshot(before), service.BannerSnapshot(&after))
	}
	response.Success(w, http.StatusOK, req, nil)
}

// DeleteBanner godoc
//
//	@Summary		Delete a banner
//	@Description	Deletes the banner. The change is written to the audit log.
//	@Tags			Admin · Banners
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string											true	"Banner ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=object{message=string}}	"message: Banner deleted."
//	@Failure		400	{object}	response.Envelope								"Malformed id"
//	@Failure		401	{object}	response.Envelope								"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope								"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope								"Banner not found"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/banners/{id} [delete]
func (h *MerchandisingHandler) DeleteBanner(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	before, _ := h.svc.GetBanner(r.Context(), id)
	if err := h.svc.DeleteBanner(r.Context(), id); err != nil {
		h.fail(w, err, "delete banner")
		return
	}
	if before != nil {
		h.record(r, "banner.delete", "banner", id.String(), before.Headline, service.BannerSnapshot(before), nil)
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "Banner deleted."}, nil)
}

// ---------------------------------------------------------------- categories

// ListCategories godoc
//
//	@Summary		List categories
//	@Description	Returns every category with the number of products filed under it.
//	@Tags			Admin · Categories
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=[]dto.AdminCategory}
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/categories [get]
func (h *MerchandisingHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.ListCategories(r.Context())
	if err != nil {
		h.fail(w, err, "list categories")
		return
	}
	response.Success(w, http.StatusOK, rows, nil)
}

func (h *MerchandisingHandler) saveCategory(w http.ResponseWriter, r *http.Request, id *uuid.UUID, status int) {
	var in dto.CategoryInput
	if !decode(w, r, &in) {
		return
	}
	var before *models.Category
	action := "category.create"
	if id != nil {
		before, _ = h.svc.GetCategory(r.Context(), *id)
		action = "category.update"
	}
	c, err := h.svc.SaveCategory(r.Context(), id, in)
	if err != nil {
		h.fail(w, err, "save category")
		return
	}
	h.record(r, action, "category", c.ID.String(), c.Name, service.CategorySnapshot(before), service.CategorySnapshot(c))
	response.Success(w, status, c, nil)
}

// CreateCategory godoc
//
//	@Summary		Create a category
//	@Description	Creates a category. An empty slug is derived from the name. The change is written to the audit log.
//	@Tags			Admin · Categories
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.CategoryInput	true	"Category"
//	@Success		201		{object}	response.Envelope{data=models.Category}
//	@Failure		400		{object}	response.Envelope	"Invalid body"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields; error.fields.slug when another category already uses the slug"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/categories [post]
func (h *MerchandisingHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	h.saveCategory(w, r, nil, http.StatusCreated)
}

// UpdateCategory godoc
//
//	@Summary		Update a category
//	@Description	Updates the category. An empty slug is derived from the name. Changed fields are written to the audit log.
//	@Tags			Admin · Categories
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string				true	"Category ID"	Format(uuid)
//	@Param			body	body		dto.CategoryInput	true	"Category"
//	@Success		200		{object}	response.Envelope{data=models.Category}
//	@Failure		400		{object}	response.Envelope	"Invalid body or malformed id"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Category not found"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields; error.fields.slug when another category already uses the slug"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/categories/{id} [put]
func (h *MerchandisingHandler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	if id, ok := pathID(w, r); ok {
		h.saveCategory(w, r, &id, http.StatusOK)
	}
}

// DeleteCategory godoc
//
//	@Summary		Delete a category
//	@Description	Deletes the category. Refused while products are still filed under it. The change is written to the audit log.
//	@Tags			Admin · Categories
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string											true	"Category ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=object{message=string}}	"message: Category deleted."
//	@Failure		400	{object}	response.Envelope								"Malformed id"
//	@Failure		401	{object}	response.Envelope								"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope								"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope								"Category not found"
//	@Failure		409	{object}	response.Envelope								"IN_USE: products still use this category"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/categories/{id} [delete]
func (h *MerchandisingHandler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	before, _ := h.svc.GetCategory(r.Context(), id)
	if err := h.svc.DeleteCategory(r.Context(), id); err != nil {
		h.fail(w, err, "delete category")
		return
	}
	if before != nil {
		h.record(r, "category.delete", "category", id.String(), before.Name, service.CategorySnapshot(before), nil)
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "Category deleted."}, nil)
}

// ---------------------------------------------------------------- brands

// ListBrands godoc
//
//	@Summary		List brands
//	@Description	Returns every brand with the number of products that carry it.
//	@Tags			Admin · Brands
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=[]dto.AdminBrand}
//	@Failure		401	{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/brands [get]
func (h *MerchandisingHandler) ListBrands(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.ListBrands(r.Context())
	if err != nil {
		h.fail(w, err, "list brands")
		return
	}
	response.Success(w, http.StatusOK, rows, nil)
}

func (h *MerchandisingHandler) saveBrand(w http.ResponseWriter, r *http.Request, id *uuid.UUID, status int) {
	var in dto.BrandInput
	if !decode(w, r, &in) {
		return
	}
	var before *models.Brand
	action := "brand.create"
	if id != nil {
		before, _ = h.svc.GetBrand(r.Context(), *id)
		action = "brand.update"
	}
	b, err := h.svc.SaveBrand(r.Context(), id, in)
	if err != nil {
		h.fail(w, err, "save brand")
		return
	}
	h.record(r, action, "brand", b.ID.String(), b.Name, service.BrandSnapshot(before), service.BrandSnapshot(b))
	response.Success(w, status, b, nil)
}

// CreateBrand godoc
//
//	@Summary		Create a brand
//	@Description	Creates a brand. An empty slug is derived from the name. The change is written to the audit log.
//	@Tags			Admin · Brands
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			body	body		dto.BrandInput	true	"Brand"
//	@Success		201		{object}	response.Envelope{data=models.Brand}
//	@Failure		400		{object}	response.Envelope	"Invalid body"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields; error.fields.slug when another brand already uses the slug"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/brands [post]
func (h *MerchandisingHandler) CreateBrand(w http.ResponseWriter, r *http.Request) {
	h.saveBrand(w, r, nil, http.StatusCreated)
}

// UpdateBrand godoc
//
//	@Summary		Update a brand
//	@Description	Updates the brand. An empty slug is derived from the name. Changed fields are written to the audit log.
//	@Tags			Admin · Brands
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string			true	"Brand ID"	Format(uuid)
//	@Param			body	body		dto.BrandInput	true	"Brand"
//	@Success		200		{object}	response.Envelope{data=models.Brand}
//	@Failure		400		{object}	response.Envelope	"Invalid body or malformed id"
//	@Failure		401		{object}	response.Envelope	"UNAUTHORIZED: not signed in"
//	@Failure		403		{object}	response.Envelope	"FORBIDDEN: signed in without the admin role"
//	@Failure		404		{object}	response.Envelope	"Brand not found"
//	@Failure		422		{object}	response.Envelope	"VALIDATION_FAILED: per-field messages in error.fields; error.fields.slug when another brand already uses the slug"
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/brands/{id} [put]
func (h *MerchandisingHandler) UpdateBrand(w http.ResponseWriter, r *http.Request) {
	if id, ok := pathID(w, r); ok {
		h.saveBrand(w, r, &id, http.StatusOK)
	}
}

// DeleteBrand godoc
//
//	@Summary		Delete a brand
//	@Description	Deletes the brand. Refused while products still carry it. The change is written to the audit log.
//	@Tags			Admin · Brands
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string											true	"Brand ID"	Format(uuid)
//	@Success		200	{object}	response.Envelope{data=object{message=string}}	"message: Brand deleted."
//	@Failure		400	{object}	response.Envelope								"Malformed id"
//	@Failure		401	{object}	response.Envelope								"UNAUTHORIZED: not signed in"
//	@Failure		403	{object}	response.Envelope								"FORBIDDEN: signed in without the admin role"
//	@Failure		404	{object}	response.Envelope								"Brand not found"
//	@Failure		409	{object}	response.Envelope								"IN_USE: products still use this brand"
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/brands/{id} [delete]
func (h *MerchandisingHandler) DeleteBrand(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	before, _ := h.svc.GetBrand(r.Context(), id)
	if err := h.svc.DeleteBrand(r.Context(), id); err != nil {
		h.fail(w, err, "delete brand")
		return
	}
	if before != nil {
		h.record(r, "brand.delete", "brand", id.String(), before.Name, service.BrandSnapshot(before), nil)
	}
	response.Success(w, http.StatusOK, map[string]string{"message": "Brand deleted."}, nil)
}
