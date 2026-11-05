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
	audit        service.AuditService
}

func NewAdminHandler(adminService service.AdminService, audit service.AuditService) *AdminHandler {
	return &AdminHandler{adminService: adminService, audit: audit}
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

	before, _ := h.adminService.GetOrder(r.Context(), orderID)
	err = h.adminService.UpdateOrderStatus(r.Context(), orderID, req)
	if err != nil {
		if errors.Is(err, repository.ErrSerialNumberRequired) {
			response.Error(w, http.StatusBadRequest, "SERIAL_NUMBER_REQUIRED", "Serial number is required for all order items before marking as SHIPPED.")
			return
		}
		if errors.Is(err, repository.ErrShipmentRequired) {
			field := "tracking_number"
			if strings.Contains(err.Error(), "carrier.") {
				field = "carrier"
			}
			msg := strings.TrimPrefix(err.Error(), repository.ErrShipmentRequired.Error()+": ")
			response.ValidationFailed(w, "Add the carrier and tracking number before marking as shipped.", map[string]string{field: msg})
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

	if after, _ := h.adminService.GetOrder(r.Context(), orderID); before != nil && after != nil {
		if changes := orderChanges(before, after); len(changes) > 0 {
			h.audit.Record(r.Context(), actorFrom(r), service.AuditEntry{
				Action: "order.status", EntityType: "order", EntityID: after.ID.String(), EntityLabel: after.OrderNumber, Changes: changes,
			})
		}
	}

	response.Success(w, http.StatusOK, map[string]string{
		"message": "order status successfully updated",
		"status":  req.Status,
	}, nil)
}

// orderChanges lists what an admin changed on an order: status, shipment and serial numbers.
func orderChanges(before, after *models.Order) []models.AuditChange {
	var out []models.AuditChange
	add := func(field, from, to string) {
		if from != to {
			out = append(out, models.AuditChange{Field: field, From: from, To: to})
		}
	}
	add("status", before.Status, after.Status)
	add("carrier", before.Carrier, after.Carrier)
	add("tracking_number", before.TrackingNumber, after.TrackingNumber)
	serials := func(o *models.Order) map[string]string {
		m := map[string]string{}
		for _, it := range o.Items {
			m[it.SKUSnapshot] = strings.Join(it.SerialNumbers, ", ")
		}
		return m
	}
	b, a := serials(before), serials(after)
	for _, it := range after.Items {
		add("serials."+it.SKUSnapshot, b[it.SKUSnapshot], a[it.SKUSnapshot])
	}
	return out
}
