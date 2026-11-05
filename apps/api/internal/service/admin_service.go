package service

import (
	"context"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

type AdminService interface {
	GetOverview(ctx context.Context) (*dto.AdminOverviewStats, error)
	ListOrders(ctx context.Context, filter dto.OrderListFilter) ([]models.Order, int64, error)
	UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error
	GetOrder(ctx context.Context, id uuid.UUID) (*models.Order, error)
}

type adminService struct {
	orderRepo repository.OrderRepository
}

func NewAdminService(orderRepo repository.OrderRepository) AdminService {
	return &adminService{orderRepo: orderRepo}
}

func (s *adminService) GetOverview(ctx context.Context) (*dto.AdminOverviewStats, error) {
	return s.orderRepo.GetAdminOverview(ctx)
}

func (s *adminService) ListOrders(ctx context.Context, filter dto.OrderListFilter) ([]models.Order, int64, error) {
	return s.orderRepo.ListOrders(ctx, filter)
}

func (s *adminService) UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error {
	return s.orderRepo.UpdateOrderStatus(ctx, orderID, req.Status, req.SerialNumbers, models.Shipment{Carrier: req.Carrier, TrackingNumber: req.TrackingNumber})
}

// GetOrder returns one order with its items, or nil when it doesn't exist.
func (s *adminService) GetOrder(ctx context.Context, id uuid.UUID) (*models.Order, error) {
	return s.orderRepo.GetOrderByID(ctx, id)
}
