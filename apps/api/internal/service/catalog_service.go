package service

import (
	"context"
	"errors"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
)

var (
	ErrProductNotFound = errors.New("product not found")
)

type CatalogService interface {
	GetCatalog(ctx context.Context, filter dto.CatalogFilter) ([]models.Product, int64, *dto.FacetCounts, error)
	GetProductBySlug(ctx context.Context, slug string) (*models.Product, error)
	CompareProducts(ctx context.Context, slugs []string) ([]models.Product, error)
	Search(ctx context.Context, query string) ([]models.Product, error)
	GetCategories(ctx context.Context) ([]models.Category, error)
	GetBrands(ctx context.Context) ([]models.Brand, error)
	GetBanners(ctx context.Context) (map[string][]models.Banner, error)
}

type catalogService struct {
	catalogRepo repository.CatalogRepository
	bannerRepo  repository.BannerRepository
}

func NewCatalogService(catalogRepo repository.CatalogRepository, bannerRepo repository.BannerRepository) CatalogService {
	return &catalogService{
		catalogRepo: catalogRepo,
		bannerRepo:  bannerRepo,
	}
}

func (s *catalogService) GetCatalog(ctx context.Context, filter dto.CatalogFilter) ([]models.Product, int64, *dto.FacetCounts, error) {
	return s.catalogRepo.FilterProducts(ctx, filter)
}

func (s *catalogService) GetProductBySlug(ctx context.Context, slug string) (*models.Product, error) {
	product, err := s.catalogRepo.GetProductBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if product == nil {
		return nil, ErrProductNotFound
	}
	return product, nil
}

func (s *catalogService) CompareProducts(ctx context.Context, slugs []string) ([]models.Product, error) {
	if len(slugs) > 3 {
		slugs = slugs[:3]
	}
	return s.catalogRepo.GetProductsBySlugs(ctx, slugs)
}

func (s *catalogService) Search(ctx context.Context, query string) ([]models.Product, error) {
	return s.catalogRepo.Search(ctx, query, 8)
}

func (s *catalogService) GetCategories(ctx context.Context) ([]models.Category, error) {
	return s.catalogRepo.ListCategories(ctx)
}

func (s *catalogService) GetBrands(ctx context.Context) ([]models.Brand, error) {
	return s.catalogRepo.ListBrands(ctx)
}

func (s *catalogService) GetBanners(ctx context.Context) (map[string][]models.Banner, error) {
	banners, err := s.bannerRepo.GetActive(ctx)
	if err != nil {
		return nil, err
	}

	grouped := map[string][]models.Banner{
		"HERO_SPLIT": {},
		"BENTO_GRID": {},
		"TOP_RIBBON": {},
	}

	for _, b := range banners {
		grouped[b.Placement] = append(grouped[b.Placement], b)
	}

	return grouped, nil
}
