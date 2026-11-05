package repository

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProductRef identifies a product by ID, slug and name.
type ProductRef struct {
	ID   uuid.UUID
	Slug string
	Name string
}

// VariantOwner is the product that already holds a SKU.
type VariantOwner struct {
	VariantID uuid.UUID
	SKU       string
	ProductRef
}

// ProductImportLookup answers the questions a CSV import asks about existing data.
type ProductImportLookup interface {
	ProductsBySlug(ctx context.Context, slugs []string) (map[string]ProductRef, error)
	// ProductsByName matches names case-insensitively, keyed by the lowercased trimmed name.
	ProductsByName(ctx context.Context, names []string) (map[string][]ProductRef, error)
	VariantOwners(ctx context.Context, skus []string) (map[string]VariantOwner, error)
	CategorySlugs(ctx context.Context) (map[string]uuid.UUID, error)
	BrandSlugs(ctx context.Context) (map[string]uuid.UUID, error)
	AllProductIDs(ctx context.Context) ([]uuid.UUID, error)
}

type productImportLookup struct {
	db *gorm.DB
}

func NewProductImportLookup(db *gorm.DB) ProductImportLookup {
	return &productImportLookup{db: db}
}

func (r *productImportLookup) ProductsBySlug(ctx context.Context, slugs []string) (map[string]ProductRef, error) {
	out := map[string]ProductRef{}
	if len(slugs) == 0 {
		return out, nil
	}
	var rows []ProductRef
	if err := r.db.WithContext(ctx).Table("products").Select("id, slug, name").Where("slug IN ?", slugs).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, p := range rows {
		out[p.Slug] = p
	}
	return out, nil
}

func (r *productImportLookup) ProductsByName(ctx context.Context, names []string) (map[string][]ProductRef, error) {
	out := map[string][]ProductRef{}
	if len(names) == 0 {
		return out, nil
	}
	lower := make([]string, len(names))
	for i, n := range names {
		lower[i] = strings.ToLower(strings.TrimSpace(n))
	}
	var rows []ProductRef
	if err := r.db.WithContext(ctx).Table("products").Select("id, slug, name").
		Where("LOWER(TRIM(name)) IN ?", lower).Order("name, slug").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, p := range rows {
		k := strings.ToLower(strings.TrimSpace(p.Name))
		out[k] = append(out[k], p)
	}
	return out, nil
}

func (r *productImportLookup) VariantOwners(ctx context.Context, skus []string) (map[string]VariantOwner, error) {
	out := map[string]VariantOwner{}
	if len(skus) == 0 {
		return out, nil
	}
	var rows []struct {
		VariantID uuid.UUID
		SKU       string
		ID        uuid.UUID
		Slug      string
		Name      string
	}
	err := r.db.WithContext(ctx).Table("product_variants v").
		Select("v.id AS variant_id, v.sku, p.id, p.slug, p.name").
		Joins("JOIN products p ON p.id = v.product_id").
		Where("v.sku IN ?", skus).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.SKU] = VariantOwner{VariantID: row.VariantID, SKU: row.SKU, ProductRef: ProductRef{ID: row.ID, Slug: row.Slug, Name: row.Name}}
	}
	return out, nil
}

func (r *productImportLookup) slugMap(ctx context.Context, table string) (map[string]uuid.UUID, error) {
	var rows []struct {
		ID   uuid.UUID
		Slug string
	}
	if err := r.db.WithContext(ctx).Table(table).Select("id, slug").Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]uuid.UUID, len(rows))
	for _, row := range rows {
		out[row.Slug] = row.ID
	}
	return out, nil
}

func (r *productImportLookup) CategorySlugs(ctx context.Context) (map[string]uuid.UUID, error) {
	return r.slugMap(ctx, "categories")
}

func (r *productImportLookup) BrandSlugs(ctx context.Context) (map[string]uuid.UUID, error) {
	return r.slugMap(ctx, "brands")
}

// AllProductIDs lists every product (on sale or not), by name.
func (r *productImportLookup) AllProductIDs(ctx context.Context) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).Table("products").Order("name, slug").Pluck("id", &ids).Error
	return ids, err
}
