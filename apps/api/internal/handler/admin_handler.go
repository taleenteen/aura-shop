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

// GetOverview godoc
//
//	@Summary		Get the dashboard overview
//	@Description	Revenue (all time and the last 30 days against the 30 days before), order counts by status, the last 7 days of daily revenue, revenue by category and low-stock options.
//	@Tags			Admin · Overview
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	response.Envelope{data=dto.AdminOverviewStats}
//	@Failure		401	{object}	response.Envelope
//	@Failure		403	{object}	response.Envelope
//	@Failure		500	{object}	response.Envelope
//	@Router			/admin/overview [get]
func (h *AdminHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := h.adminService.GetOverview(r.Context())
	if err != nil {
		slog.Error("admin overview failed", "error", err)
		response.InternalServerError(w, "failed to fetch admin overview")
		return
	}

	response.Success(w, http.StatusOK, overview, nil)
}

// ListOrders godoc
//
//	@Summary		List orders
//	@Description	Returns a page of orders with their items, newest first. `meta` carries page, limit, total_items and total_pages.
//	@Tags			Admin · Orders
//	@Produce		json
//	@Security		BearerAuth
//	@Param			status	query		string	false	"Filter by status"	Enums(PENDING_PAYMENT, PAID_PROCESSING, SN_ASSIGNED, SHIPPED, DELIVERED, CANCELLED)
//	@Param			q		query		string	false	"Search by order number or customer email"
//	@Param			page	query		int		false	"Page number"				default(1)	minimum(1)
//	@Param			limit	query		int		false	"Page size (capped at 100)"	default(20)	minimum(1)	maximum(100)
//	@Success		200		{object}	response.Envelope{data=[]models.Order}
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/orders [get]
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
		response.ServerError(w, err)
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

// UpdateOrderStatus godoc
//
//	@Summary		Update an order's status
//	@Description	Moves an order to a new status (only allowed transitions) and saves serial numbers per order item (one per unit; a blank entry keeps the saved serial).
//	@Description	SHIPPED requires a serial for every unit plus `carrier` (KERRY, FLASH or DHL) and `tracking_number`. CANCELLED returns the order's stock (reserved and already committed).
//	@Description	Moving to SHIPPED, DELIVERED or CANCELLED writes the matching customer email, and every change is recorded in the activity log.
//	@Description	`data` is an object with `message` and `status` (the new status).
//	@Tags			Admin · Orders
//	@Accept			json
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id		path		string							true	"Order ID (UUID)"
//	@Param			body	body		dto.UpdateOrderStatusRequest	true	"New status, serial numbers and shipment"
//	@Success		200		{object}	response.Envelope{data=object}
//	@Failure		400		{object}	response.Envelope	"BAD_REQUEST, SERIAL_NUMBER_REQUIRED, INVALID_SERIAL_NUMBERS, or VALIDATION_FAILED (error.fields.carrier or error.fields.tracking_number)"
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		404		{object}	response.Envelope
//	@Failure		409		{object}	response.Envelope	"INVALID_ORDER_TRANSITION"
//	@Router			/admin/orders/{id}/status [patch]
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
