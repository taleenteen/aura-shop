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
