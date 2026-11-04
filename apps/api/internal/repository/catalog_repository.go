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
	CreateProductWithVariants(ctx context.Context, product *models.Product) error
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
		Preload("Variants").
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
		Preload("Variants").
		Where("slug IN (?) AND is_active = ?", slugs, true).
		Find(&products).Error
	if err != nil {
		return nil, fmt.Errorf("failed to fetch products by slugs: %w", err)
	}
	return products, nil
}

func (r *catalogRepository) FilterProducts(ctx context.Context, filter dto.CatalogFilter) ([]models.Product, int64, *dto.FacetCounts, error) {
	query := r.db.WithContext(ctx).Model(&models.Product{}).
		Joins("JOIN categories ON categories.id = products.category_id").
		Joins("JOIN brands ON brands.id = products.brand_id").
		Where("products.is_active = ?", true)

	if filter.Category != "" {
		query = query.Where("categories.slug = ?", strings.ToLower(filter.Category))
	}
	if filter.Brand != "" {
		query = query.Where("brands.slug = ?", strings.ToLower(filter.Brand))
	}
	if filter.Persona != "" {
		personaJSON := fmt.Sprintf(`["%s"]`, strings.ToUpper(filter.Persona))
		query = query.Where("products.usage_personas @> ?", personaJSON)
	}
	if filter.MinPrice > 0 {
		query = query.Where("products.base_price >= ?", filter.MinPrice)
	}
	if filter.MaxPrice > 0 {
		query = query.Where("products.base_price <= ?", filter.MaxPrice)
	}

	// Variant-level specs filters (CPU, RAM, Storage)
	if filter.CPU != "" || filter.RAM > 0 || filter.Storage > 0 {
		subQuery := r.db.Model(&models.ProductVariant{}).Select("product_id")
		if filter.CPU != "" {
			subQuery = subQuery.Where("specs->>'cpu_family' ILIKE ?", "%"+filter.CPU+"%")
		}
		if filter.RAM > 0 {
			subQuery = subQuery.Where("(specs->>'ram_gb')::int = ?", filter.RAM)
		}
		if filter.Storage > 0 {
			subQuery = subQuery.Where("(specs->>'storage_gb')::int = ?", filter.Storage)
		}
		query = query.Where("products.id IN (?)", subQuery)
	}

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
		Preload("Variants").
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

func (r *catalogRepository) calculateFacets(ctx context.Context, filter dto.CatalogFilter) (*dto.FacetCounts, error) {
	facets := &dto.FacetCounts{
		Personas:  []dto.FacetOption{},
		Brands:    []dto.FacetOption{},
		CPUFamily: []dto.FacetOption{},
		RAM:       []dto.FacetOption{},
		Storage:   []dto.FacetOption{},
	}

	// Dynamic facet query for Personas
	personaDefs := []struct {
		Value string
		Label string
	}{
		{"CREATOR", "Creator (Video & 3D)"},
		{"GAMING", "High-FPS Gaming"},
		{"ULTRALIGHT", "Ultralight (< 1.3 kg)"},
		{"OFFICE", "Office & Productivity"},
	}

	for _, p := range personaDefs {
		var cnt int64
		pJSON := fmt.Sprintf(`["%s"]`, p.Value)
		q := r.db.WithContext(ctx).Model(&models.Product{}).Where("is_active = ? AND usage_personas @> ?", true, pJSON)
		if filter.Category != "" {
			q = q.Joins("JOIN categories ON categories.id = products.category_id").Where("categories.slug = ?", strings.ToLower(filter.Category))
		}
		_ = q.Count(&cnt).Error
		facets.Personas = append(facets.Personas, dto.FacetOption{
			Value:    p.Value,
			Label:    p.Label,
			Count:    cnt,
			Disabled: cnt == 0,
		})
	}

	// Dynamic facet query for Brands
	var brandRows []struct {
		Slug  string
		Name  string
		Count int64
	}
	bq := r.db.WithContext(ctx).Table("brands").
		Select("brands.slug, brands.name, count(products.id) as count").
		Joins("LEFT JOIN products ON products.brand_id = brands.id AND products.is_active = true").
		Group("brands.id, brands.slug, brands.name").
		Order("brands.name ASC")
	_ = bq.Scan(&brandRows).Error

	for _, b := range brandRows {
		facets.Brands = append(facets.Brands, dto.FacetOption{
			Value:    b.Slug,
			Label:    b.Name,
			Count:    b.Count,
			Disabled: b.Count == 0,
		})
	}

	// Dynamic facet query for CPU Families
	cpuFamilies := []string{"Apple M4 Pro", "Apple M4", "Apple M3", "Intel Core Ultra 9", "Intel Core Ultra 7", "AMD Ryzen AI 9"}
	for _, cpu := range cpuFamilies {
		var cnt int64
		_ = r.db.WithContext(ctx).Table("product_variants").
			Joins("JOIN products ON products.id = product_variants.product_id").
			Where("products.is_active = true AND product_variants.specs->>'cpu_family' ILIKE ?", "%"+cpu+"%").
			Distinct("products.id").
			Count(&cnt).Error

		facets.CPUFamily = append(facets.CPUFamily, dto.FacetOption{
			Value:    cpu,
			Label:    cpu,
			Count:    cnt,
			Disabled: cnt == 0,
		})
	}

	// RAM options
	ramSizes := []int{16, 24, 32, 48, 64}
	for _, ram := range ramSizes {
		var cnt int64
		_ = r.db.WithContext(ctx).Table("product_variants").
			Joins("JOIN products ON products.id = product_variants.product_id").
			Where("products.is_active = true AND (product_variants.specs->>'ram_gb')::int = ?", ram).
			Distinct("products.id").
			Count(&cnt).Error

		facets.RAM = append(facets.RAM, dto.FacetOption{
			Value:    fmt.Sprintf("%d", ram),
			Label:    fmt.Sprintf("%dGB", ram),
			Count:    cnt,
			Disabled: cnt == 0,
		})
	}

	// Storage options
	storageSizes := []int{256, 512, 1024, 2048}
	for _, storage := range storageSizes {
		var cnt int64
		label := fmt.Sprintf("%dGB", storage)
		if storage >= 1024 {
			label = fmt.Sprintf("%dTB", storage/1024)
		}
		_ = r.db.WithContext(ctx).Table("product_variants").
			Joins("JOIN products ON products.id = product_variants.product_id").
			Where("products.is_active = true AND (product_variants.specs->>'storage_gb')::int = ?", storage).
			Distinct("products.id").
			Count(&cnt).Error

		facets.Storage = append(facets.Storage, dto.FacetOption{
			Value:    fmt.Sprintf("%d", storage),
			Label:    label,
			Count:    cnt,
			Disabled: cnt == 0,
		})
	}

	// Price range bounds
	var priceStats struct {
		MinPrice int64
		MaxPrice int64
	}
	_ = r.db.WithContext(ctx).Model(&models.Product{}).
		Where("is_active = true").
		Select("COALESCE(MIN(base_price), 0) as min_price, COALESCE(MAX(base_price), 0) as max_price").
		Scan(&priceStats).Error

	facets.PriceRange.MinSatang = priceStats.MinPrice
	facets.PriceRange.MaxSatang = priceStats.MaxPrice

	return facets, nil
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
		Preload("Variants").
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

func (r *catalogRepository) CreateProductWithVariants(ctx context.Context, product *models.Product) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(product).Error; err != nil {
			return fmt.Errorf("failed to create product: %w", err)
		}
		return nil
	})
}
