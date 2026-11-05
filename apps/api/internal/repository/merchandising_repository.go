package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrBannerNotFound   = errors.New("banner not found")
	ErrCategoryNotFound = errors.New("category not found")
	ErrBrandNotFound    = errors.New("brand not found")
	// ErrSlugTaken is returned when another category or brand already uses the slug.
	ErrSlugTaken = errors.New("slug already in use")
	// ErrTaxonomyInUse is returned when deleting a category or brand that still has products.
	ErrTaxonomyInUse = errors.New("still used by products")
)

// MerchandisingRepository stores the store-front content admins manage: banners, categories, brands.
type MerchandisingRepository interface {
	ListBanners(ctx context.Context) ([]models.Banner, error)
	GetBanner(ctx context.Context, id uuid.UUID) (*models.Banner, error)
	SaveBanner(ctx context.Context, banner *models.Banner) error
	SetBannerActive(ctx context.Context, id uuid.UUID, active bool) error
	DeleteBanner(ctx context.Context, id uuid.UUID) error

	ListCategoriesWithCounts(ctx context.Context) ([]dto.AdminCategory, error)
	GetCategory(ctx context.Context, id uuid.UUID) (*models.Category, error)
	SaveCategory(ctx context.Context, c *models.Category) error
	DeleteCategory(ctx context.Context, id uuid.UUID) error

	ListBrandsWithCounts(ctx context.Context) ([]dto.AdminBrand, error)
	GetBrand(ctx context.Context, id uuid.UUID) (*models.Brand, error)
	SaveBrand(ctx context.Context, b *models.Brand) error
	DeleteBrand(ctx context.Context, id uuid.UUID) error
}

type merchandisingRepository struct {
	db *gorm.DB
}

func NewMerchandisingRepository(db *gorm.DB) MerchandisingRepository {
	return &merchandisingRepository{db: db}
}

// ---------------------------------------------------------------- banners

func (r *merchandisingRepository) ListBanners(ctx context.Context) ([]models.Banner, error) {
	var banners []models.Banner
	err := r.db.WithContext(ctx).Order("placement ASC, sort_order ASC, created_at DESC").Find(&banners).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list banners: %w", err)
	}
	return banners, nil
}

func (r *merchandisingRepository) GetBanner(ctx context.Context, id uuid.UUID) (*models.Banner, error) {
	var b models.Banner
	if err := r.db.WithContext(ctx).First(&b, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBannerNotFound
		}
		return nil, err
	}
	return &b, nil
}

// SaveBanner creates the banner when it has no ID and replaces every field otherwise.
func (r *merchandisingRepository) SaveBanner(ctx context.Context, banner *models.Banner) error {
	db := r.db.WithContext(ctx)
	if banner.ID == uuid.Nil {
		return db.Create(banner).Error
	}
	// Select("*") writes zero values too (an emptied badge, sort order 0, inactive).
	res := db.Model(banner).Select("*").Omit("id", "created_at").Updates(banner)
	if res.Error != nil {
		return fmt.Errorf("failed to save banner: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrBannerNotFound
	}
	return nil
}

func (r *merchandisingRepository) SetBannerActive(ctx context.Context, id uuid.UUID, active bool) error {
	res := r.db.WithContext(ctx).Model(&models.Banner{}).Where("id = ?", id).Update("is_active", active)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrBannerNotFound
	}
	return nil
}

func (r *merchandisingRepository) DeleteBanner(ctx context.Context, id uuid.UUID) error {
	res := r.db.WithContext(ctx).Delete(&models.Banner{}, "id = ?", id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrBannerNotFound
	}
	return nil
}

// ---------------------------------------------------------------- categories

func (r *merchandisingRepository) ListCategoriesWithCounts(ctx context.Context) ([]dto.AdminCategory, error) {
	var rows []dto.AdminCategory
	err := r.db.WithContext(ctx).Table("categories c").
		Select("c.id, c.slug, c.name, c.icon_name, c.nav_label, c.sort_order, COUNT(p.id) AS product_count").
		Joins("LEFT JOIN products p ON p.category_id = c.id").
		Group("c.id").
		Order("c.sort_order ASC, c.name ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list categories: %w", err)
	}
	return rows, nil
}

func (r *merchandisingRepository) GetCategory(ctx context.Context, id uuid.UUID) (*models.Category, error) {
	var c models.Category
	if err := r.db.WithContext(ctx).First(&c, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCategoryNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *merchandisingRepository) SaveCategory(ctx context.Context, c *models.Category) error {
	db := r.db.WithContext(ctx)
	if err := r.slugFree(db, "categories", c.Slug, c.ID); err != nil {
		return err
	}
	if c.ID == uuid.Nil {
		return translateUnique(db.Create(c).Error)
	}
	res := db.Model(c).Select("slug", "name", "icon_name", "nav_label", "sort_order").Updates(c)
	if res.Error != nil {
		return translateUnique(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrCategoryNotFound
	}
	return nil
}

func (r *merchandisingRepository) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	return r.deleteUnused(ctx, "categories", &models.Category{}, "category_id", id, ErrCategoryNotFound)
}

// ---------------------------------------------------------------- brands

func (r *merchandisingRepository) ListBrandsWithCounts(ctx context.Context) ([]dto.AdminBrand, error) {
	var rows []dto.AdminBrand
	err := r.db.WithContext(ctx).Table("brands b").
		Select("b.id, b.slug, b.name, b.logo_url, COUNT(p.id) AS product_count").
		Joins("LEFT JOIN products p ON p.brand_id = b.id").
		Group("b.id").
		Order("b.name ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list brands: %w", err)
	}
	return rows, nil
}

func (r *merchandisingRepository) GetBrand(ctx context.Context, id uuid.UUID) (*models.Brand, error) {
	var b models.Brand
	if err := r.db.WithContext(ctx).First(&b, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBrandNotFound
		}
		return nil, err
	}
	return &b, nil
}

func (r *merchandisingRepository) SaveBrand(ctx context.Context, b *models.Brand) error {
	db := r.db.WithContext(ctx)
	if err := r.slugFree(db, "brands", b.Slug, b.ID); err != nil {
		return err
	}
	if b.ID == uuid.Nil {
		return translateUnique(db.Create(b).Error)
	}
	res := db.Model(b).Select("slug", "name", "logo_url").Updates(b)
	if res.Error != nil {
		return translateUnique(res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrBrandNotFound
	}
	return nil
}

func (r *merchandisingRepository) DeleteBrand(ctx context.Context, id uuid.UUID) error {
	return r.deleteUnused(ctx, "brands", &models.Brand{}, "brand_id", id, ErrBrandNotFound)
}

// ---------------------------------------------------------------- helpers

// slugFree reports ErrSlugTaken when another row of the table already uses slug.
func (r *merchandisingRepository) slugFree(db *gorm.DB, table, slug string, self uuid.UUID) error {
	var n int64
	if err := db.Table(table).Where("slug = ? AND id <> ?", slug, self).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return ErrSlugTaken
	}
	return nil
}

// translateUnique maps a unique-index violation (a slug saved concurrently) to ErrSlugTaken.
func translateUnique(err error) error {
	if err != nil && (errors.Is(err, gorm.ErrDuplicatedKey) || strings.Contains(err.Error(), "SQLSTATE 23505")) {
		return ErrSlugTaken
	}
	return err
}

// deleteUnused deletes a category or brand only when no product references it. Products are
// counted inside the transaction with the row locked, so a product cannot be attached meanwhile.
func (r *merchandisingRepository) deleteUnused(ctx context.Context, table string, model interface{}, column string, id uuid.UUID, notFound error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Exec("SELECT 1 FROM "+table+" WHERE id = ? FOR UPDATE", id)
		if res.Error != nil {
			return res.Error
		}
		var inUse int64
		if err := tx.Model(&models.Product{}).Where(column+" = ?", id).Count(&inUse).Error; err != nil {
			return err
		}
		if inUse > 0 {
			return fmt.Errorf("%w: %d product(s)", ErrTaxonomyInUse, inUse)
		}
		del := tx.Delete(model, "id = ?", id)
		if del.Error != nil {
			return del.Error
		}
		if del.RowsAffected == 0 {
			return notFound
		}
		return nil
	})
}
