package repository

import (
	"context"
	"fmt"
	"time"

	"aura-tech/api/internal/models"

	"gorm.io/gorm"
)

type BannerRepository interface {
	GetActive(ctx context.Context) ([]models.Banner, error)
	Create(ctx context.Context, banner *models.Banner) error
	Update(ctx context.Context, banner *models.Banner) error
}

type bannerRepository struct {
	db *gorm.DB
}

func NewBannerRepository(db *gorm.DB) BannerRepository {
	return &bannerRepository{db: db}
}

func (r *bannerRepository) GetActive(ctx context.Context) ([]models.Banner, error) {
	var banners []models.Banner
	now := time.Now()
	err := r.db.WithContext(ctx).
		Where("is_active = ? AND start_at <= ? AND end_at >= ?", true, now, now).
		Order("sort_order ASC, created_at DESC").
		Find(&banners).Error
	if err != nil {
		return nil, fmt.Errorf("failed to fetch active banners: %w", err)
	}
	return banners, nil
}

func (r *bannerRepository) Create(ctx context.Context, banner *models.Banner) error {
	if err := r.db.WithContext(ctx).Create(banner).Error; err != nil {
		return fmt.Errorf("failed to create banner: %w", err)
	}
	return nil
}

func (r *bannerRepository) Update(ctx context.Context, banner *models.Banner) error {
	if err := r.db.WithContext(ctx).Save(banner).Error; err != nil {
		return fmt.Errorf("failed to update banner: %w", err)
	}
	return nil
}
