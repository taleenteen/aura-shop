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

// GetBanners godoc
//
//	@Summary		List live banners by placement
//	@Description	Returns the banners that are active and inside their schedule, grouped by placement. The keys HERO_SPLIT, BENTO_GRID and TOP_RIBBON are always present (empty arrays when nothing is live).
//	@Tags			Banners
//	@Produce		json
//	@Success		200	{object}	response.Envelope{data=map[string][]models.Banner}
//	@Failure		500	{object}	response.Envelope
//	@Router			/banners [get]
func (h *BannerHandler) GetBanners(w http.ResponseWriter, r *http.Request) {
	banners, err := h.catalogService.GetBanners(r.Context())
	if err != nil {
		response.InternalServerError(w, "failed to fetch banners")
		return
	}

	response.Success(w, http.StatusOK, banners, nil)
}
