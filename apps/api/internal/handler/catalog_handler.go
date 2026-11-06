package handler

import (
	"net/http"
	"strconv"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/go-chi/chi/v5"
)

type CatalogHandler struct {
	catalogService service.CatalogService
}

func NewCatalogHandler(catalogService service.CatalogService) *CatalogHandler {
	return &CatalogHandler{catalogService: catalogService}
}

// GetCatalog godoc
//
//	@Summary		List catalog products
//	@Description	Returns one page of active products matching the filters. meta carries pagination (page, limit, total_items, total_pages) and meta.facets carries dto.FacetCounts for the current filters.
//	@Tags			Catalog
//	@Produce		json
//	@Param			category	query		string	false	"Category slug"
//	@Param			brand		query		string	false	"Brand slug"
//	@Param			persona		query		string	false	"Persona filter"
//	@Param			cpu			query		string	false	"CPU family"
//	@Param			ram			query		int		false	"RAM in GB"
//	@Param			storage		query		int		false	"Storage in GB"
//	@Param			min_price	query		int		false	"Minimum price in satang"
//	@Param			max_price	query		int		false	"Maximum price in satang"
//	@Param			sort		query		string	false	"Sort order; newest first when omitted"	Enums(price_asc, price_desc)
//	@Param			page		query		int		false	"Page number"							default(1)	minimum(1)
//	@Param			limit		query		int		false	"Page size (max 100)"					default(12)	minimum(1)	maximum(100)
//	@Success		200			{object}	response.Envelope{data=[]models.Product}
//	@Failure		500			{object}	response.Envelope
//	@Router			/catalog [get]
func (h *CatalogHandler) GetCatalog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	ram, _ := strconv.Atoi(q.Get("ram"))
	storage, _ := strconv.Atoi(q.Get("storage"))
	minPrice, _ := strconv.ParseInt(q.Get("min_price"), 10, 64)
	maxPrice, _ := strconv.ParseInt(q.Get("max_price"), 10, 64)
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}

	filter := dto.CatalogFilter{
		Category: q.Get("category"),
		Brand:    q.Get("brand"),
		Persona:  q.Get("persona"),
		CPU:      q.Get("cpu"),
		RAM:      ram,
		Storage:  storage,
		MinPrice: minPrice,
		MaxPrice: maxPrice,
		Sort:     q.Get("sort"),
		Page:     page,
		Limit:    limit,
	}

	products, total, facets, err := h.catalogService.GetCatalog(r.Context(), filter)
	if err != nil {
		response.InternalServerError(w, "failed to query catalog")
		return
	}

	totalPages := int((total + int64(limit) - 1) / int64(limit))
	meta := &response.Meta{
		Page:       page,
		Limit:      limit,
		TotalItems: int(total),
		TotalPages: totalPages,
		Facets:     facets,
	}

	response.Success(w, http.StatusOK, products, meta)
}

// GetProductBySlug godoc
//
//	@Summary		Get a product
//	@Description	Returns an active product with its category, brand, variants and accessory bundles.
//	@Tags			Catalog
//	@Produce		json
//	@Param			slug	path		string	true	"Product slug"
//	@Success		200		{object}	response.Envelope{data=models.Product}
//	@Failure		400		{object}	response.Envelope
//	@Failure		404		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/products/{slug} [get]
func (h *CatalogHandler) GetProductBySlug(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		response.BadRequest(w, "product slug is required")
		return
	}

	product, err := h.catalogService.GetProductBySlug(r.Context(), slug)
	if err != nil {
		if err == service.ErrProductNotFound {
			response.NotFound(w, "product not found")
			return
		}
		response.InternalServerError(w, "failed to fetch product")
		return
	}

	response.Success(w, http.StatusOK, product, nil)
}

// CompareProducts godoc
//
//	@Summary		Compare products
//	@Description	Returns the active products for the given slugs; unknown or inactive slugs are left out.
//	@Tags			Catalog
//	@Produce		json
//	@Param			slugs	query		string	true	"Comma-separated product slugs"
//	@Success		200		{object}	response.Envelope{data=[]models.Product}
//	@Failure		400		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/products/compare [get]
func (h *CatalogHandler) CompareProducts(w http.ResponseWriter, r *http.Request) {
	slugsParam := r.URL.Query().Get("slugs")
	if slugsParam == "" {
		response.BadRequest(w, "query param 'slugs' is required (comma-separated)")
		return
	}

	rawSlugs := strings.Split(slugsParam, ",")
	var slugs []string
	for _, s := range rawSlugs {
		trimmed := strings.TrimSpace(s)
		if trimmed != "" {
			slugs = append(slugs, trimmed)
		}
	}

	products, err := h.catalogService.CompareProducts(r.Context(), slugs)
	if err != nil {
		response.InternalServerError(w, "failed to compare products")
		return
	}

	response.Success(w, http.StatusOK, products, nil)
}

// Search godoc
//
//	@Summary		Search products
//	@Description	Matches product and variant names; returns up to 8 active products. An empty query returns `data: null`.
//	@Tags			Catalog
//	@Produce		json
//	@Param			q	query		string	false	"Search text"
//	@Success		200	{object}	response.Envelope{data=[]models.Product}
//	@Failure		500	{object}	response.Envelope
//	@Router			/search [get]
func (h *CatalogHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	products, err := h.catalogService.Search(r.Context(), query)
	if err != nil {
		response.InternalServerError(w, "failed to execute search")
		return
	}

	response.Success(w, http.StatusOK, products, nil)
}

// GetCategories godoc
//
//	@Summary	List categories
//	@Tags		Catalog
//	@Produce	json
//	@Success	200	{object}	response.Envelope{data=[]models.Category}
//	@Failure	500	{object}	response.Envelope
//	@Router		/categories [get]
func (h *CatalogHandler) GetCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.catalogService.GetCategories(r.Context())
	if err != nil {
		response.InternalServerError(w, "failed to fetch categories")
		return
	}
	response.Success(w, http.StatusOK, categories, nil)
}

// GetBrands godoc
//
//	@Summary	List brands
//	@Tags		Catalog
//	@Produce	json
//	@Success	200	{object}	response.Envelope{data=[]models.Brand}
//	@Failure	500	{object}	response.Envelope
//	@Router		/brands [get]
func (h *CatalogHandler) GetBrands(w http.ResponseWriter, r *http.Request) {
	brands, err := h.catalogService.GetBrands(r.Context())
	if err != nil {
		response.InternalServerError(w, "failed to fetch brands")
		return
	}
	response.Success(w, http.StatusOK, brands, nil)
}
