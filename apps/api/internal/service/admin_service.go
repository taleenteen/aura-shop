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
	ListOrders(ctx context.Context, status string, page, limit int) ([]models.Order, int64, error)
	CreateBanner(ctx context.Context, banner *models.Banner) error
	CreateProduct(ctx context.Context, product *models.Product) error
	UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error
}

type adminService struct {
	orderRepo   repository.OrderRepository
	bannerRepo  repository.BannerRepository
	catalogRepo repository.CatalogRepository
}

func NewAdminService(
	orderRepo repository.OrderRepository,
	bannerRepo repository.BannerRepository,
	catalogRepo repository.CatalogRepository,
) AdminService {
	return &adminService{
		orderRepo:   orderRepo,
		bannerRepo:  bannerRepo,
		catalogRepo: catalogRepo,
	}
}

func (s *adminService) GetOverview(ctx context.Context) (*dto.AdminOverviewStats, error) {
	return s.orderRepo.GetAdminOverview(ctx)
}

func (s *adminService) ListOrders(ctx context.Context, status string, page, limit int) ([]models.Order, int64, error) {
	return s.orderRepo.ListOrders(ctx, status, page, limit)
}

func (s *adminService) CreateBanner(ctx context.Context, banner *models.Banner) error {
	return s.bannerRepo.Create(ctx, banner)
}

func (s *adminService) CreateProduct(ctx context.Context, product *models.Product) error {
	return s.catalogRepo.CreateProductWithVariants(ctx, product)
}

func (s *adminService) UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, req dto.UpdateOrderStatusRequest) error {
	return s.orderRepo.UpdateOrderStatus(ctx, orderID, req.Status, req.SerialNumbers)
}
