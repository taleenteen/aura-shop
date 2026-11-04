package main

import (
	"log/slog"
	"os"

	"aura-tech/api/internal/config"
	"aura-tech/api/internal/database"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	slog.Info("initializing database seeder", "project", cfg.ProjectName)

	db, err := database.ConnectPostgres(cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to postgres for seeding", "error", err)
		os.Exit(1)
	}

	if err := database.SeedAll(db); err != nil {
		slog.Error("failed to seed database", "error", err)
		os.Exit(1)
	}

	slog.Info("database seeding completed successfully")
}
