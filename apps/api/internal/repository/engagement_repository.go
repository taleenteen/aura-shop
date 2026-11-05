package repository

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrVariantInStock   = errors.New("this option is in stock")
	ErrReviewNotAllowed = errors.New("only customers who received this product can review it")
	ErrReviewNotFound   = errors.New("review not found")
)

// EngagementRepository stores back-in-stock alerts, account emails and product reviews.
type EngagementRepository interface {
	CreateStockAlert(ctx context.Context, userID, variantID uuid.UUID) error
	DeleteStockAlert(ctx context.Context, userID, variantID uuid.UUID) error
	ListStockAlerts(ctx context.Context, userID uuid.UUID) ([]dto.StockAlertView, error)
	ListAccountEmails(ctx context.Context, userID uuid.UUID, limit int) ([]models.EmailMessage, error)

	ProductIDBySlug(ctx context.Context, slug string) (uuid.UUID, error)
	ReviewSummary(ctx context.Context, productID uuid.UUID) (dto.ReviewSummary, error)
	ListReviews(ctx context.Context, productID uuid.UUID, page, limit int) ([]dto.ReviewView, int64, error)
	GetUserReview(ctx context.Context, productID, userID uuid.UUID) (*models.Review, error)
	HasReceivedProduct(ctx context.Context, productID, userID uuid.UUID) (bool, error)
	UpsertReview(ctx context.Context, r *models.Review) error
	DeleteUserReview(ctx context.Context, productID, userID uuid.UUID) error
	ListReviewsAdmin(ctx context.Context, filter dto.AdminReviewFilter) ([]dto.AdminReview, int64, error)
	SetReviewHidden(ctx context.Context, id uuid.UUID, hidden bool) error
}

type engagementRepository struct {
	db *gorm.DB
}

func NewEngagementRepository(db *gorm.DB) EngagementRepository {
	return &engagementRepository{db: db}
}

// ---------------------------------------------------------------- stock alerts

func (r *engagementRepository) CreateStockAlert(ctx context.Context, userID, variantID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var v models.ProductVariant
		if err := tx.First(&v, "id = ?", variantID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrVariantNotFound
			}
			return err
		}
		if v.StockQuantity-v.ReservedStock > 0 {
			return ErrVariantInStock
		}
		// Asking twice keeps the existing alert.
		return tx.Exec(`INSERT INTO stock_alerts (id, user_id, variant_id, created_at)
			VALUES (uuid_generate_v4(), ?, ?, now())
			ON CONFLICT (user_id, variant_id) WHERE notified_at IS NULL DO NOTHING`, userID, variantID).Error
	})
}

func (r *engagementRepository) DeleteStockAlert(ctx context.Context, userID, variantID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Where("user_id = ? AND variant_id = ? AND notified_at IS NULL", userID, variantID).
		Delete(&models.StockAlert{}).Error
}

func (r *engagementRepository) ListStockAlerts(ctx context.Context, userID uuid.UUID) ([]dto.StockAlertView, error) {
	var rows []dto.StockAlertView
	err := r.db.WithContext(ctx).Table("stock_alerts a").
		Select(`a.variant_id, a.created_at, p.name AS product_name, p.slug AS product_slug,
			v.color_name || ' / ' || v.sku AS variant, v.images->>0 AS image, v.price`).
		Joins("JOIN product_variants v ON v.id = a.variant_id").
		Joins("JOIN products p ON p.id = v.product_id").
		Where("a.user_id = ? AND a.notified_at IS NULL", userID).
		Order("a.created_at DESC").
		Scan(&rows).Error
	return rows, err
}

func (r *engagementRepository) ListAccountEmails(ctx context.Context, userID uuid.UUID, limit int) ([]models.EmailMessage, error) {
	var msgs []models.EmailMessage
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("sent_at DESC").Limit(limit).Find(&msgs).Error
	return msgs, err
}

// notifyBackInStock emails everyone waiting for these variants that can now be bought, and
// closes their alerts. Call it inside the transaction that raised the available stock, after
// the variant rows were updated.
func notifyBackInStock(tx *gorm.DB, variantIDs ...uuid.UUID) error {
	if len(variantIDs) == 0 {
		return nil
	}
	var pending []struct {
		AlertID   uuid.UUID
		UserID    uuid.UUID
		Email     string
		VariantID uuid.UUID
		Name      string
		Slug      string
		Variant   string
		Image     string
		Price     int64
	}
	err := tx.Table("stock_alerts a").
		Select(`a.id AS alert_id, a.user_id, u.email, v.id AS variant_id, p.name, p.slug,
			v.color_name || ' / ' || v.sku AS variant, COALESCE(v.images->>0, '') AS image, v.price`).
		Joins("JOIN users u ON u.id = a.user_id").
		Joins("JOIN product_variants v ON v.id = a.variant_id").
		Joins("JOIN products p ON p.id = v.product_id").
		Where("a.notified_at IS NULL AND a.variant_id IN ? AND v.stock_quantity - v.reserved_stock > 0 AND p.is_active", variantIDs).
		Scan(&pending).Error
	if err != nil {
		return fmt.Errorf("failed to load stock alerts: %w", err)
	}
	now := time.Now()
	for _, a := range pending {
		msg := models.NewBackInStockEmail(a.UserID, a.Email, models.BackInStock{
			ProductName: a.Name, ProductSlug: a.Slug, VariantID: a.VariantID.String(),
			Variant: a.Variant, Image: a.Image, Price: a.Price,
		}, now)
		if err := tx.Create(&msg).Error; err != nil {
			return fmt.Errorf("failed to queue back-in-stock email: %w", err)
		}
		if err := tx.Model(&models.StockAlert{}).Where("id = ?", a.AlertID).Update("notified_at", now).Error; err != nil {
			return err
		}
		slog.Info("email sent", "kind", msg.Kind, "to", a.Email, "variant", a.Variant)
	}
	return nil
}

// ---------------------------------------------------------------- reviews

func (r *engagementRepository) ProductIDBySlug(ctx context.Context, slug string) (uuid.UUID, error) {
	var p models.Product
	err := r.db.WithContext(ctx).Select("id").Where("slug = ? AND is_active", slug).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return uuid.Nil, ErrProductNotFound
	}
	return p.ID, err
}

func (r *engagementRepository) ReviewSummary(ctx context.Context, productID uuid.UUID) (dto.ReviewSummary, error) {
	var rows []struct {
		Rating int
		N      int
	}
	err := r.db.WithContext(ctx).Model(&models.Review{}).
		Select("rating, COUNT(*) AS n").
		Where("product_id = ? AND NOT is_hidden", productID).
		Group("rating").Scan(&rows).Error
	s := dto.ReviewSummary{Distribution: [5]int{}}
	total := 0
	for _, row := range rows {
		if row.Rating >= 1 && row.Rating <= 5 {
			s.Distribution[row.Rating-1] = row.N
			s.Count += row.N
			total += row.Rating * row.N
		}
	}
	if s.Count > 0 {
		s.Average = float64(total) / float64(s.Count)
	}
	return s, err
}

func (r *engagementRepository) ListReviews(ctx context.Context, productID uuid.UUID, page, limit int) ([]dto.ReviewView, int64, error) {
	q := r.db.WithContext(ctx).Table("reviews r").Where("r.product_id = ? AND NOT r.is_hidden", productID)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []dto.ReviewView
	err := q.Select("r.id, r.rating, r.title, r.body, r.created_at, r.updated_at, u.full_name AS author_name").
		Joins("JOIN users u ON u.id = r.user_id").
		Order("r.created_at DESC").
		Offset((page - 1) * limit).Limit(limit).
		Scan(&rows).Error
	return rows, total, err
}

func (r *engagementRepository) GetUserReview(ctx context.Context, productID, userID uuid.UUID) (*models.Review, error) {
	var rv models.Review
	err := r.db.WithContext(ctx).Where("product_id = ? AND user_id = ?", productID, userID).First(&rv).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &rv, err
}

// HasReceivedProduct reports whether the user has a delivered order containing the product.
func (r *engagementRepository) HasReceivedProduct(ctx context.Context, productID, userID uuid.UUID) (bool, error) {
	var n int64
	err := r.db.WithContext(ctx).Table("orders o").
		Joins("JOIN order_items i ON i.order_id = o.id").
		Joins("JOIN product_variants v ON v.id = i.variant_id").
		Where("o.user_id = ? AND o.status = ? AND v.product_id = ?", userID, models.OrderStatusDelivered, productID).
		Limit(1).Count(&n).Error
	return n > 0, err
}

// UpsertReview creates the user's review of the product or replaces its rating and text.
// Editing keeps an admin's decision to hide it.
func (r *engagementRepository) UpsertReview(ctx context.Context, rv *models.Review) error {
	return r.db.WithContext(ctx).Exec(`INSERT INTO reviews (id, product_id, user_id, rating, title, body, is_hidden, created_at, updated_at)
		VALUES (uuid_generate_v4(), ?, ?, ?, ?, ?, false, now(), now())
		ON CONFLICT (product_id, user_id) DO UPDATE
		SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body, updated_at = now()`,
		rv.ProductID, rv.UserID, rv.Rating, rv.Title, rv.Body).Error
}

func (r *engagementRepository) DeleteUserReview(ctx context.Context, productID, userID uuid.UUID) error {
	res := r.db.WithContext(ctx).Where("product_id = ? AND user_id = ?", productID, userID).Delete(&models.Review{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrReviewNotFound
	}
	return nil
}

func (r *engagementRepository) ListReviewsAdmin(ctx context.Context, f dto.AdminReviewFilter) ([]dto.AdminReview, int64, error) {
	q := r.db.WithContext(ctx).Table("reviews r").
		Joins("JOIN users u ON u.id = r.user_id").
		Joins("JOIN products p ON p.id = r.product_id")
	switch f.Status {
	case "visible":
		q = q.Where("NOT r.is_hidden")
	case "hidden":
		q = q.Where("r.is_hidden")
	}
	if f.Rating >= 1 && f.Rating <= 5 {
		q = q.Where("r.rating = ?", f.Rating)
	}
	if f.Search != "" {
		like := "%" + escapeLikePattern(f.Search) + "%"
		q = q.Where("p.name ILIKE ? OR u.email ILIKE ? OR r.title ILIKE ? OR r.body ILIKE ?", like, like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []dto.AdminReview
	err := q.Select(`r.id, r.rating, r.title, r.body, r.is_hidden, r.created_at,
			u.full_name AS author_name, u.email AS author_email, p.name AS product_name, p.slug AS product_slug`).
		Order("r.created_at DESC").
		Offset((f.Page - 1) * f.Limit).Limit(f.Limit).
		Scan(&rows).Error
	return rows, total, err
}

func (r *engagementRepository) SetReviewHidden(ctx context.Context, id uuid.UUID, hidden bool) error {
	res := r.db.WithContext(ctx).Model(&models.Review{}).Where("id = ?", id).Update("is_hidden", hidden)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrReviewNotFound
	}
	return nil
}

