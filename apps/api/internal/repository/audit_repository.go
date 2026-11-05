package repository

import (
	"context"
	"fmt"
	"time"

	"aura-tech/api/internal/models"

	"gorm.io/gorm"
)

// AuditFilter selects a page of the audit log.
type AuditFilter struct {
	EntityType string
	Actor      string // email, partial
	Search     string // entity label or ID, partial
	From, To   *time.Time
	Page       int
	Limit      int
}

type AuditRepository interface {
	Create(ctx context.Context, entry *models.AuditLog) error
	List(ctx context.Context, f AuditFilter) ([]models.AuditLog, int64, error)
}

type auditRepository struct {
	db *gorm.DB
}

func NewAuditRepository(db *gorm.DB) AuditRepository {
	return &auditRepository{db: db}
}

func (r *auditRepository) Create(ctx context.Context, entry *models.AuditLog) error {
	return r.db.WithContext(ctx).Create(entry).Error
}

func (r *auditRepository) List(ctx context.Context, f AuditFilter) ([]models.AuditLog, int64, error) {
	q := r.db.WithContext(ctx).Model(&models.AuditLog{})
	if f.EntityType != "" {
		q = q.Where("entity_type = ?", f.EntityType)
	}
	if f.Actor != "" {
		q = q.Where("actor_email ILIKE ?", "%"+escapeLikePattern(f.Actor)+"%")
	}
	if f.Search != "" {
		like := "%" + escapeLikePattern(f.Search) + "%"
		q = q.Where("entity_label ILIKE ? OR entity_id ILIKE ?", like, like)
	}
	if f.From != nil {
		q = q.Where("created_at >= ?", *f.From)
	}
	if f.To != nil {
		q = q.Where("created_at < ?", *f.To)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count audit log: %w", err)
	}
	var rows []models.AuditLog
	err := q.Order("created_at DESC").Offset((f.Page - 1) * f.Limit).Limit(f.Limit).Find(&rows).Error
	return rows, total, err
}
