package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"aura-tech/api/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func ConnectPostgres(databaseURL string) (*gorm.DB, error) {
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	}

	db, err := gorm.Open(postgres.Open(databaseURL), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve sql.DB instance: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	slog.Info("successfully established postgres database connection")
	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	slog.Info("running database schema auto-migrations...")

	err := db.AutoMigrate(
		&models.User{},
		&models.Category{},
		&models.Brand{},
		&models.Banner{},
		&models.Product{},
		&models.ProductVariant{},
		&models.ProductAccessoryBundle{},
		&models.Wishlist{},
		&models.CartItem{},
		&models.StockReservation{},
		&models.Order{},
		&models.OrderItem{},
	)
	if err != nil {
		return fmt.Errorf("failed to auto-migrate schemas: %w", err)
	}

	slog.Info("database schema auto-migration succeeded")

	if err := backfillOrderItemSerials(db); err != nil {
		return fmt.Errorf("failed to backfill order item serials: %w", err)
	}

	if err := EnsureGINIndexes(db); err != nil {
		return fmt.Errorf("failed to ensure gin indexes: %w", err)
	}

	return nil
}

// backfillOrderItemSerials copies the legacy single serial_number into the per-unit
// serial_numbers array. Idempotent: rows that already have serial_numbers are skipped.
// The legacy column is left in place; nothing reads it any more.
func backfillOrderItemSerials(db *gorm.DB) error {
	if !db.Migrator().HasColumn(&models.OrderItem{}, "serial_number") {
		return nil
	}
	res := db.Exec(`UPDATE order_items
		SET serial_numbers = jsonb_build_array(serial_number)
		WHERE serial_number IS NOT NULL AND serial_number <> ''
		  AND (serial_numbers IS NULL OR serial_numbers = '[]'::jsonb)`)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		slog.Info("backfilled per-unit serial numbers from legacy column", "rows", res.RowsAffected)
	}
	return nil
}

func EnsureGINIndexes(db *gorm.DB) error {
	rawIndexQueries := []string{
		`CREATE INDEX IF NOT EXISTS idx_products_usage_personas ON products USING GIN (usage_personas);`,
		`CREATE INDEX IF NOT EXISTS idx_product_variants_specs ON product_variants USING GIN (specs);`,
		`CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);`,
	}

	for _, query := range rawIndexQueries {
		if err := db.Exec(query).Error; err != nil {
			return fmt.Errorf("failed to execute index query [%s]: %w", query, err)
		}
	}

	slog.Info("successfully verified and ensured GIN indexes on jsonb and text fields")
	return nil
}
