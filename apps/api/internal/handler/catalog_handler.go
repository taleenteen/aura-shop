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

func (h *CatalogHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	products, err := h.catalogService.Search(r.Context(), query)
	if err != nil {
		response.InternalServerError(w, "failed to execute search")
		return
	}

	response.Success(w, http.StatusOK, products, nil)
}

func (h *CatalogHandler) GetCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.catalogService.GetCategories(r.Context())
	if err != nil {
		response.InternalServerError(w, "failed to fetch categories")
		return
	}
	response.Success(w, http.StatusOK, categories, nil)
}

func (h *CatalogHandler) GetBrands(w http.ResponseWriter, r *http.Request) {
	brands, err := h.catalogService.GetBrands(r.Context())
	if err != nil {
		response.InternalServerError(w, "failed to fetch brands")
		return
	}
	response.Success(w, http.StatusOK, brands, nil)
}
