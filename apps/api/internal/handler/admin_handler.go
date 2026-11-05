package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	defaultOrdersPageSize = 20
	maxOrdersPageSize     = 100
)

type AdminHandler struct {
	adminService service.AdminService
}

func NewAdminHandler(adminService service.AdminService) *AdminHandler {
	return &AdminHandler{adminService: adminService}
}

func (h *AdminHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := h.adminService.GetOverview(r.Context())
	if err != nil {
		slog.Error("admin overview failed", "error", err)
		response.InternalServerError(w, "failed to fetch admin overview")
		return
	}

	response.Success(w, http.StatusOK, overview, nil)
}

func (h *AdminHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultOrdersPageSize
	}
	if limit > maxOrdersPageSize {
		limit = maxOrdersPageSize
	}

	orders, total, err := h.adminService.ListOrders(r.Context(), dto.OrderListFilter{Status: status, Search: search, Page: page, Limit: limit})
	if err != nil {
		response.InternalServerError(w, "failed to list orders: "+err.Error())
		return
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	meta := &response.Meta{
		Page:       page,
		Limit:      limit,
		TotalItems: int(total),
		TotalPages: totalPages,
	}
	response.Success(w, http.StatusOK, orders, meta)
}

func (h *AdminHandler) CreateBanner(w http.ResponseWriter, r *http.Request) {
	var banner models.Banner
	if err := json.NewDecoder(r.Body).Decode(&banner); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	if err := h.adminService.CreateBanner(r.Context(), &banner); err != nil {
		response.InternalServerError(w, "failed to create banner: "+err.Error())
		return
	}

	response.Success(w, http.StatusCreated, banner, nil)
}

func (h *AdminHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var product models.Product
	if err := json.NewDecoder(r.Body).Decode(&product); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	if err := h.adminService.CreateProduct(r.Context(), &product); err != nil {
		response.InternalServerError(w, "failed to create product: "+err.Error())
		return
	}

	response.Success(w, http.StatusCreated, product, nil)
}

func (h *AdminHandler) UpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(w, "invalid order id")
		return
	}

	var req dto.UpdateOrderStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	if req.Status == "" {
		response.BadRequest(w, "status is required")
		return
	}

	err = h.adminService.UpdateOrderStatus(r.Context(), orderID, req)
	if err != nil {
		if errors.Is(err, repository.ErrSerialNumberRequired) {
			response.Error(w, http.StatusBadRequest, "SERIAL_NUMBER_REQUIRED", "Serial number is required for all order items before marking as SHIPPED.")
			return
		}
		if errors.Is(err, repository.ErrInvalidSerialNumbers) {
			response.Error(w, http.StatusBadRequest, "INVALID_SERIAL_NUMBERS", err.Error())
			return
		}
		if errors.Is(err, repository.ErrInvalidOrderTransition) {
			response.Error(w, http.StatusConflict, "INVALID_ORDER_TRANSITION", err.Error())
			return
		}
		if errors.Is(err, repository.ErrOrderNotFound) {
			response.NotFound(w, "order not found")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.Success(w, http.StatusOK, map[string]string{
		"message": "order status successfully updated",
		"status":  req.Status,
	}, nil)
}
