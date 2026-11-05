package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/handler"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type mockAdminService struct {
	updateOrderFunc func(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error
}

func (m *mockAdminService) GetOverview(ctx context.Context) (*dto.AdminOverviewStats, error) {
	return &dto.AdminOverviewStats{}, nil
}

func (m *mockAdminService) ListOrders(ctx context.Context, filter dto.OrderListFilter) ([]models.Order, int64, error) {
	return []models.Order{}, 0, nil
}

func (m *mockAdminService) CreateBanner(ctx context.Context, banner *models.Banner) error {
	return nil
}

func (m *mockAdminService) UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error {
	if m.updateOrderFunc != nil {
		return m.updateOrderFunc(ctx, orderID, req)
	}
	return nil
}

func TestAdminUpdateOrderStatus_SerialNumberRequired(t *testing.T) {
	mockSvc := &mockAdminService{
		updateOrderFunc: func(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error {
			if req.Status == "SHIPPED" {
				return repository.ErrSerialNumberRequired
			}
			return nil
		},
	}

	adminHandler := handler.NewAdminHandler(mockSvc)

	r := chi.NewRouter()
	r.Patch("/admin/orders/{id}/status", adminHandler.UpdateOrderStatus)

	orderID := uuid.New()
	reqBody, _ := json.Marshal(dto.UpdateOrderStatusRequest{
		Status: "SHIPPED",
	})

	req := httptest.NewRequest(http.MethodPatch, "/admin/orders/"+orderID.String()+"/status", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 when missing serial numbers for SHIPPED, got %d", rec.Code)
	}

	var env response.Envelope
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Error == nil || env.Error.Code != "SERIAL_NUMBER_REQUIRED" {
		t.Fatalf("expected error code SERIAL_NUMBER_REQUIRED, got %+v", env.Error)
	}
}
