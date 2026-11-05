package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"

	"gorm.io/gorm"
)

type CatalogRepository interface {
	ListCategories(ctx context.Context) ([]models.Category, error)
	ListBrands(ctx context.Context) ([]models.Brand, error)
	GetProductBySlug(ctx context.Context, slug string) (*models.Product, error)
	GetProductsBySlugs(ctx context.Context, slugs []string) ([]models.Product, error)
	FilterProducts(ctx context.Context, filter dto.CatalogFilter) ([]models.Product, int64, *dto.FacetCounts, error)
	Search(ctx context.Context, query string, limit int) ([]models.Product, error)
}

type catalogRepository struct {
	db *gorm.DB
}

func NewCatalogRepository(db *gorm.DB) CatalogRepository {
	return &catalogRepository{db: db}
}

func (r *catalogRepository) ListCategories(ctx context.Context) ([]models.Category, error) {
	var categories []models.Category
	if err := r.db.WithContext(ctx).Order("sort_order ASC, name ASC").Find(&categories).Error; err != nil {
		return nil, fmt.Errorf("failed to list categories: %w", err)
	}
	return categories, nil
}

func (r *catalogRepository) ListBrands(ctx context.Context) ([]models.Brand, error) {
	var brands []models.Brand
	if err := r.db.WithContext(ctx).Order("name ASC").Find(&brands).Error; err != nil {
		return nil, fmt.Errorf("failed to list brands: %w", err)
	}
	return brands, nil
}

func (r *catalogRepository) GetProductBySlug(ctx context.Context, slug string) (*models.Product, error) {
	var product models.Product
	err := r.db.WithContext(ctx).
		Preload("Category").
		Preload("Brand").
		Preload("Variants", orderVariants).
		Preload("AccessoryBundles.AccessoryProduct.Variants").
		Preload("AccessoryBundles.AccessoryProduct.Brand").
		Where("slug = ? AND is_active = ?", slug, true).
		First(&product).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to fetch product by slug: %w", err)
	}
	return &product, nil
}

func (r *catalogRepository) GetProductsBySlugs(ctx context.Context, slugs []string) ([]models.Product, error) {
	if len(slugs) == 0 {
		return nil, nil
	}
	var products []models.Product
	err := r.db.WithContext(ctx).
		Preload("Category").
		Preload("Brand").
		Preload("Variants", orderVariants).
		Where("slug IN (?) AND is_active = ?", slugs, true).
		Find(&products).Error
	if err != nil {
		return nil, fmt.Errorf("failed to fetch products by slugs: %w", err)
	}
	return products, nil
}

func (r *catalogRepository) FilterProducts(ctx context.Context, filter dto.CatalogFilter) ([]models.Product, int64, *dto.FacetCounts, error) {
	// The listing and the facet counts share productScope, so a facet's count is exactly what
	// ticking it returns.
	query := r.productScope(ctx, filter, groupNone, true)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, nil, fmt.Errorf("failed to count filtered products: %w", err)
	}

	// Sort logic
	switch filter.Sort {
	case "price_asc":
		query = query.Order("products.base_price ASC")
	case "price_desc":
		query = query.Order("products.base_price DESC")
	default:
		query = query.Order("products.created_at DESC")
	}

	// Pagination
	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 100 {
		limit = 12
	}
	offset := (page - 1) * limit

	var products []models.Product
	err := query.
		Preload("Category").
		Preload("Brand").
		Preload("Variants", orderVariants).
		Offset(offset).
		Limit(limit).
		Find(&products).Error
	if err != nil {
		return nil, 0, nil, fmt.Errorf("failed to fetch filtered products: %w", err)
	}

	facets, err := r.calculateFacets(ctx, filter)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("failed to compute facets: %w", err)
	}

	return products, total, facets, nil
}

func (r *catalogRepository) Search(ctx context.Context, query string, limit int) ([]models.Product, error) {
	if limit <= 0 || limit > 50 {
		limit = 8
	}
	cleanQ := strings.TrimSpace(query)
	if cleanQ == "" {
		return nil, nil
	}

	pattern := "%" + cleanQ + "%"
	var products []models.Product

	// Fast search using ILIKE / pg_trgm index across products and product_variants
	err := r.db.WithContext(ctx).
		Distinct("products.*").
		Preload("Category").
		Preload("Brand").
		Preload("Variants", orderVariants).
		Joins("LEFT JOIN product_variants ON product_variants.product_id = products.id").
		Where("products.is_active = true AND ("+
			"products.name ILIKE ? OR "+
			"products.tagline ILIKE ? OR "+
			"products.short_description ILIKE ? OR "+
			"product_variants.sku ILIKE ? OR "+
			"product_variants.specs::text ILIKE ?"+
			")", pattern, pattern, pattern, pattern, pattern).
		Limit(limit).
		Find(&products).Error

	if err != nil {
		return nil, fmt.Errorf("failed to search products: %w", err)
	}

	return products, nil
}
