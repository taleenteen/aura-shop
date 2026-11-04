package handler

import (
	"net/http"

	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
)

type BannerHandler struct {
	catalogService service.CatalogService
}

func NewBannerHandler(catalogService service.CatalogService) *BannerHandler {
	return &BannerHandler{catalogService: catalogService}
}

func (h *BannerHandler) GetBanners(w http.ResponseWriter, r *http.Request) {
	banners, err := h.catalogService.GetBanners(r.Context())
	if err != nil {
		response.InternalServerError(w, "failed to fetch banners")
		return
	}

	response.Success(w, http.StatusOK, banners, nil)
}
