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
	"gorm.io/gorm/clause"
)

var (
	ErrProductNotFound = errors.New("product not found")
	ErrVariantNotFound = errors.New("variant not found")
	// ErrVariantInUse blocks removing a variant that orders, carts in checkout or stock still depend on.
	ErrVariantInUse = errors.New("variant is in use")
	// ErrStockChanged means the stock moved after the admin loaded it; they must re-check.
	ErrStockChanged = errors.New("stock changed since it was loaded")
	ErrInvalidStock = errors.New("invalid stock change")
)

// lowStockThreshold matches the dashboard's low-stock alert.
const lowStockThreshold = 3

type ProductAdminRepository interface {
	ListProducts(ctx context.Context, filter dto.AdminProductListFilter) ([]dto.AdminProductSummary, int64, error)
	GetProduct(ctx context.Context, id uuid.UUID) (*models.Product, error)
	CategoryExists(ctx context.Context, id uuid.UUID) (bool, error)
	BrandExists(ctx context.Context, id uuid.UUID) (bool, error)
	SlugTaken(ctx context.Context, slug string, exceptProductID *uuid.UUID) (bool, error)
	SKUsTaken(ctx context.Context, skus []string, exceptProductID *uuid.UUID) ([]string, error)
	CreateProduct(ctx context.Context, product *models.Product, initialStock []int, actor Actor) error
	UpdateProduct(ctx context.Context, product *models.Product, initialStock []int, actor Actor) error
	SetActive(ctx context.Context, id uuid.UUID, active bool) error
	ArchiveProduct(ctx context.Context, id uuid.UUID) error
	RestoreProduct(ctx context.Context, id uuid.UUID) error
	DeleteProduct(ctx context.Context, id uuid.UUID) error
	AdjustStock(ctx context.Context, variantID uuid.UUID, req dto.StockAdjustmentRequest, actor Actor) (*dto.StockAdjustmentResponse, error)
	ListMovements(ctx context.Context, variantID uuid.UUID, limit int) ([]models.StockMovement, error)
}

// Actor identifies the admin behind a change, for the stock ledger.
type Actor struct {
	ID    uuid.UUID
	Email string
}

type productAdminRepository struct {
	db *gorm.DB
}

func NewProductAdminRepository(db *gorm.DB) ProductAdminRepository {
	return &productAdminRepository{db: db}
}

func (r *productAdminRepository) ListProducts(ctx context.Context, f dto.AdminProductListFilter) ([]dto.AdminProductSummary, int64, error) {
	scope := func() *gorm.DB {
		q := r.db.WithContext(ctx).Table("products AS p").
			Joins("JOIN categories c ON c.id = p.category_id").
			Joins("JOIN brands b ON b.id = p.brand_id")
		if f.Search != "" {
			pattern := "%" + escapeLikePattern(f.Search) + "%"
			q = q.Where(`p.name ILIKE ? OR p.slug ILIKE ? OR b.name ILIKE ?
				OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.sku ILIKE ?)`,
				pattern, pattern, pattern, pattern)
		}
		if f.Category != "" {
			q = q.Where("c.slug = ?", strings.ToLower(f.Category))
		}
		switch f.Status {
		case "archived":
			q = q.Where("p.archived_at IS NOT NULL")
		case "active":
			q = q.Where("p.archived_at IS NULL AND p.is_active = true")
		case "inactive":
			q = q.Where("p.archived_at IS NULL AND p.is_active = false")
		default:
			q = q.Where("p.archived_at IS NULL")
		}
		return q
	}

	var total int64
	if err := scope().Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count products: %w", err)
	}

	var rows []dto.AdminProductSummary
	err := scope().
		Joins("LEFT JOIN product_variants v ON v.product_id = p.id").
		Select(`p.id, p.slug, p.name, c.name AS category_name, b.name AS brand_name, p.is_active, p.archived_at,
			(SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi
				JOIN product_variants ov ON ov.id = oi.variant_id WHERE ov.product_id = p.id) AS order_count,
			p.base_price AS min_price, p.updated_at,
			COUNT(v.id) AS variant_count,
			COALESCE(SUM(v.stock_quantity), 0) AS stock_total,
			COALESCE(SUM(v.reserved_stock), 0) AS reserved_total,
			COUNT(v.id) FILTER (WHERE v.stock_quantity - v.reserved_stock <= ?) AS low_stock_count,
			COALESCE((ARRAY_AGG(v.images->>0 ORDER BY v.price) FILTER (WHERE v.images->>0 IS NOT NULL))[1], '') AS thumbnail`,
			lowStockThreshold).
		Group("p.id, c.name, b.name").
		Order("p.updated_at DESC").
		Offset((f.Page - 1) * f.Limit).
		Limit(f.Limit).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list products: %w", err)
	}
	if rows == nil {
		rows = []dto.AdminProductSummary{}
	}
	return rows, total, nil
}

func (r *productAdminRepository) GetProduct(ctx context.Context, id uuid.UUID) (*models.Product, error) {
	var p models.Product
	err := r.db.WithContext(ctx).
		Preload("Category").
		Preload("Brand").
		Preload("Variants", orderVariants).
		First(&p, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProductNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to load product: %w", err)
	}
	return &p, nil
}

func (r *productAdminRepository) exists(ctx context.Context, model interface{}, id uuid.UUID) (bool, error) {
	var n int64
	if err := r.db.WithContext(ctx).Model(model).Where("id = ?", id).Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *productAdminRepository) CategoryExists(ctx context.Context, id uuid.UUID) (bool, error) {
	return r.exists(ctx, &models.Category{}, id)
}

func (r *productAdminRepository) BrandExists(ctx context.Context, id uuid.UUID) (bool, error) {
	return r.exists(ctx, &models.Brand{}, id)
}

func (r *productAdminRepository) SlugTaken(ctx context.Context, slug string, except *uuid.UUID) (bool, error) {
	q := r.db.WithContext(ctx).Model(&models.Product{}).Where("slug = ?", slug)
	if except != nil {
		q = q.Where("id <> ?", *except)
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *productAdminRepository) SKUsTaken(ctx context.Context, skus []string, except *uuid.UUID) ([]string, error) {
	if len(skus) == 0 {
		return nil, nil
	}
	q := r.db.WithContext(ctx).Model(&models.ProductVariant{}).Where("sku IN ?", skus)
	if except != nil {
		q = q.Where("product_id <> ?", *except)
	}
	var taken []string
	if err := q.Pluck("sku", &taken).Error; err != nil {
		return nil, err
	}
	return taken, nil
}

// CreateProduct inserts the product and its variants. initialStock[i] is variant i's opening
// stock, recorded in the ledger as INITIAL.
func (r *productAdminRepository) CreateProduct(ctx context.Context, p *models.Product, initialStock []int, actor Actor) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		variants := p.Variants
		p.Variants = nil
		if err := tx.Omit(clause.Associations).Create(p).Error; err != nil {
			return fmt.Errorf("failed to create product: %w", err)
		}
		for i := range variants {
			variants[i].ProductID = p.ID
			variants[i].StockQuantity = initialStock[i]
			variants[i].ReservedStock = 0
			if err := tx.Omit(clause.Associations).Create(&variants[i]).Error; err != nil {
				return fmt.Errorf("failed to create variant %s: %w", variants[i].SKU, err)
			}
			if initialStock[i] > 0 {
				if err := recordMovement(tx, variants[i].ID, initialStock[i], initialStock[i], models.StockReasonInitial, "", &actor, nil); err != nil {
					return err
				}
			}
		}
		p.Variants = variants
		return nil
	})
}

// UpdateProduct replaces the product's editable fields and its variant list. Variants with an
// ID are updated in place (stock untouched), new ones are created with initialStock, and
// variants missing from the list are removed when nothing depends on them.
func (r *productAdminRepository) UpdateProduct(ctx context.Context, p *models.Product, initialStock []int, actor Actor) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current models.Product
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", p.ID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProductNotFound
			}
			return err
		}
		if current.ArchivedAt != nil && p.IsActive {
			return ErrProductArchived // editing is fine; going on sale needs a restore first
		}
		var existing []models.ProductVariant
		if err := tx.Where("product_id = ?", p.ID).Find(&existing).Error; err != nil {
			return err
		}
		byID := make(map[uuid.UUID]models.ProductVariant, len(existing))
		for _, v := range existing {
			byID[v.ID] = v
		}

		if err := tx.Model(&models.Product{}).Where("id = ?", p.ID).Updates(map[string]interface{}{
			"slug":              p.Slug,
			"name":              p.Name,
			"category_id":       p.CategoryID,
			"brand_id":          p.BrandID,
			"tagline":           p.Tagline,
			"short_description": p.ShortDescription,
			"base_price":        p.BasePrice,
			"usage_personas":    p.UsagePersonas,
			"bento_highlights":  p.BentoHighlights,
			"box_contents":      p.BoxContents,
			"ports_diagram":     p.PortsDiagram,
			"full_spec_matrix":  p.FullSpecMatrix,
			"is_active":         p.IsActive,
		}).Error; err != nil {
			return fmt.Errorf("failed to update product: %w", err)
		}

		kept := make(map[uuid.UUID]bool)
		for i := range p.Variants {
			v := &p.Variants[i]
			v.ProductID = p.ID
			if v.ID != uuid.Nil {
				if _, ok := byID[v.ID]; !ok {
					return fmt.Errorf("%w: %s does not belong to this product", ErrVariantNotFound, v.ID)
				}
				kept[v.ID] = true
				if err := tx.Model(&models.ProductVariant{}).Where("id = ?", v.ID).Updates(map[string]interface{}{
					"sku":           v.SKU,
					"color_name":    v.ColorName,
					"color_hex":     v.ColorHex,
					"price":         v.Price,
					"compare_price": v.ComparePrice,
					"specs":         v.Specs,
					"images":        v.Images,
				}).Error; err != nil {
					return fmt.Errorf("failed to update variant %s: %w", v.SKU, err)
				}
				continue
			}
			v.StockQuantity, v.ReservedStock = initialStock[i], 0
			if err := tx.Omit(clause.Associations).Create(v).Error; err != nil {
				return fmt.Errorf("failed to create variant %s: %w", v.SKU, err)
			}
			if initialStock[i] > 0 {
				if err := recordMovement(tx, v.ID, initialStock[i], initialStock[i], models.StockReasonInitial, "", &actor, nil); err != nil {
					return err
				}
			}
		}

		for _, v := range existing {
			if kept[v.ID] {
				continue
			}
			var ordered int64
			if err := tx.Model(&models.OrderItem{}).Where("variant_id = ?", v.ID).Count(&ordered).Error; err != nil {
				return err
			}
			switch {
			case ordered > 0:
				return fmt.Errorf("%w: %s appears in %d order(s); keep it and deactivate the product instead", ErrVariantInUse, v.SKU, ordered)
			case v.ReservedStock > 0:
				return fmt.Errorf("%w: %s has %d unit(s) held in checkout", ErrVariantInUse, v.SKU, v.ReservedStock)
			case v.StockQuantity > 0:
				return fmt.Errorf("%w: %s still has %d unit(s) in stock; write them off first", ErrVariantInUse, v.SKU, v.StockQuantity)
			}
			if err := tx.Where("variant_id = ?", v.ID).Delete(&models.CartItem{}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&models.ProductVariant{}, "id = ?", v.ID).Error; err != nil {
				return fmt.Errorf("failed to remove variant %s: %w", v.SKU, err)
			}
		}
		return nil
	})
}

func (r *productAdminRepository) SetActive(ctx context.Context, id uuid.UUID, active bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := tx.Model(&models.Product{}).Where("id = ?", id)
		if active {
			q = q.Where("archived_at IS NULL") // an archived product must be restored first
		}
		res := q.Update("is_active", active)
		if res.Error != nil {
			return fmt.Errorf("failed to update product status: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			var n int64
			if err := tx.Model(&models.Product{}).Where("id = ?", id).Count(&n).Error; err != nil {
				return err
			}
			if n == 0 {
				return ErrProductNotFound
			}
			return ErrProductArchived
		}
		if !active {
			return nil
		}
		// Back on sale: customers waiting for an option that has stock can buy it now.
		var variantIDs []uuid.UUID
		if err := tx.Model(&models.ProductVariant{}).Where("product_id = ?", id).Pluck("id", &variantIDs).Error; err != nil {
			return err
		}
		return notifyBackInStock(tx, variantIDs...)
	})
}

func (r *productAdminRepository) AdjustStock(ctx context.Context, variantID uuid.UUID, req dto.StockAdjustmentRequest, actor Actor) (*dto.StockAdjustmentResponse, error) {
	var resp dto.StockAdjustmentResponse
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var v models.ProductVariant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&v, "id = ?", variantID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrVariantNotFound
			}
			return err
		}
		if req.ExpectedStock != nil && *req.ExpectedStock != v.StockQuantity {
			return fmt.Errorf("%w: expected %d, now %d", ErrStockChanged, *req.ExpectedStock, v.StockQuantity)
		}

		next := v.StockQuantity + req.Quantity
		if req.Mode == "set" {
			next = req.Quantity
		}
		delta := next - v.StockQuantity
		switch {
		case delta == 0:
			return fmt.Errorf("%w: stock is already %d", ErrInvalidStock, v.StockQuantity)
		case next < 0:
			return fmt.Errorf("%w: stock cannot go below zero", ErrInvalidStock)
		case next < v.ReservedStock:
			return fmt.Errorf("%w: %d unit(s) are held in checkout, so stock cannot go below %d", ErrInvalidStock, v.ReservedStock, v.ReservedStock)
		}

		if err := tx.Model(&v).Update("stock_quantity", next).Error; err != nil {
			return fmt.Errorf("failed to update stock: %w", err)
		}
		if err := recordMovement(tx, v.ID, delta, next, req.Reason, req.Note, &actor, nil); err != nil {
			return err
		}
		if err := notifyBackInStock(tx, v.ID); err != nil {
			return err
		}
		resp = dto.StockAdjustmentResponse{
			VariantID: v.ID, SKU: v.SKU, StockQuantity: next, ReservedStock: v.ReservedStock,
			AvailableStock: next - v.ReservedStock, Delta: delta,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (r *productAdminRepository) ListMovements(ctx context.Context, variantID uuid.UUID, limit int) ([]models.StockMovement, error) {
	var rows []models.StockMovement
	if err := r.db.WithContext(ctx).Where("variant_id = ?", variantID).
		Order("created_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to load stock history: %w", err)
	}
	return rows, nil
}

// recordMovement appends one ledger row. Used by admin adjustments and by order payment and
// cancellation, always inside the transaction that changed stock_quantity.
func recordMovement(tx *gorm.DB, variantID uuid.UUID, delta, stockAfter int, reason, note string, actor *Actor, orderID *uuid.UUID) error {
	m := models.StockMovement{
		VariantID: variantID, Delta: delta, StockAfter: stockAfter,
		Reason: reason, Note: note, OrderID: orderID,
	}
	if actor != nil {
		id := actor.ID
		m.ActorID, m.ActorEmail = &id, actor.Email
	}
	if err := tx.Create(&m).Error; err != nil {
		return fmt.Errorf("failed to record stock movement: %w", err)
	}
	return nil
}
