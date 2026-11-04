package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"aura-tech/api/internal/config"
	"aura-tech/api/internal/database"
	"aura-tech/api/internal/handler"
	appMiddleware "aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/service"
	"aura-tech/api/internal/storage"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	slog.Info("starting aura-tech api server", "project", cfg.ProjectName, "port", cfg.APIPort)

	db, err := database.ConnectPostgres(cfg.DatabaseURL)
	if err != nil {
		slog.Warn("postgres not yet reachable at startup (will retry on boot in container)", "error", err)
	} else {
		if err := database.AutoMigrate(db); err != nil {
			slog.Error("failed to run database auto-migrations", "error", err)
		} else {
			var productCount int64
			if err := db.Model(&models.Product{}).Count(&productCount).Error; err == nil && productCount == 0 {
				slog.Info("no products found in database; seeding initial dataset...")
				if err := database.SeedAll(db); err != nil {
					slog.Error("automatic startup seeding failed", "error", err)
				} else {
					slog.Info("automatic startup seeding completed successfully")
				}
			}
		}
	}

	storageClient, err := storage.NewMinIOClient(
		cfg.MinIOEndpoint,
		cfg.MinIORootUser,
		cfg.MinIORootPassword,
		cfg.MinIOBucketName,
		cfg.MinIOPublicURL,
		cfg.MinIOUseSSL,
	)
	if err != nil {
		slog.Warn("minio not yet reachable at startup", "error", err)
	} else {
		_ = storageClient
	}

	// 1. Initialize Repositories
	userRepo := repository.NewUserRepository(db)
	bannerRepo := repository.NewBannerRepository(db)
	catalogRepo := repository.NewCatalogRepository(db)
	wishlistRepo := repository.NewWishlistRepository(db)
	cartRepo := repository.NewCartRepository(db)
	orderRepo := repository.NewOrderRepository(db)

	// 2. Initialize Services
	authService := service.NewAuthService(db, userRepo, wishlistRepo, cartRepo, cfg.JWTSecret)
	catalogService := service.NewCatalogService(catalogRepo, bannerRepo)
	interactionService := service.NewInteractionService(wishlistRepo, cartRepo)
	checkoutService := service.NewCheckoutService(orderRepo, cartRepo)
	adminService := service.NewAdminService(orderRepo, bannerRepo, catalogRepo)

	// 3. Initialize HTTP Handlers
	authHandler := handler.NewAuthHandler(authService)
	bannerHandler := handler.NewBannerHandler(catalogService)
	catalogHandler := handler.NewCatalogHandler(catalogService)
	wishlistHandler := handler.NewWishlistHandler(interactionService)
	cartHandler := handler.NewCartHandler(interactionService)
	checkoutHandler := handler.NewCheckoutHandler(checkoutService)
	adminHandler := handler.NewAdminHandler(adminService)

	// 4. Router Setup & Middleware Stack
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(appMiddleware.RequestLoggerMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Guest-Session-ID"},
		ExposedHeaders:   []string{"Link", "X-Guest-Session-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Use(appMiddleware.GuestSessionMiddleware)
	r.Use(appMiddleware.JWTOptionalMiddleware(cfg.JWTSecret))

	// Health Check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"healthy","service":"aura-tech-api"}`))
	})

	// 5. REST API v1 Routing
	r.Route("/api/v1", func(api chi.Router) {
		// Auth Routes
		api.Route("/auth", func(auth chi.Router) {
			auth.Post("/register", authHandler.Register)
			auth.Post("/login", authHandler.Login)
			auth.With(appMiddleware.RequireAuth).Get("/me", authHandler.Me)
		})

		// Dynamic Component-Driven Banners
		api.Get("/banners", bannerHandler.GetBanners)

		// Catalog, Search & Comparison
		api.Get("/categories", catalogHandler.GetCategories)
		api.Get("/brands", catalogHandler.GetBrands)
		api.Get("/catalog", catalogHandler.GetCatalog)
		api.Get("/products/compare", catalogHandler.CompareProducts)
		api.Get("/products/{slug}", catalogHandler.GetProductBySlug)
		api.Get("/search", catalogHandler.Search)

		// Wishlist (Dual User & Guest Support)
		api.Route("/wishlist", func(w chi.Router) {
			w.Get("/", wishlistHandler.GetWishlist)
			w.Post("/toggle", wishlistHandler.ToggleWishlist)
		})

		// Cart (Dual User & Guest Support)
		api.Route("/cart", func(c chi.Router) {
			c.Get("/", cartHandler.GetCart)
			c.Post("/items", cartHandler.AddToCart)
			c.Patch("/items/{id}", cartHandler.UpdateQuantity)
			c.Delete("/items/{id}", cartHandler.RemoveItem)
		})

		// Checkout & Mock Payment Gateway
		api.Route("/checkout", func(chk chi.Router) {
			chk.Post("/reserve", checkoutHandler.Reserve)
			chk.Post("/pay", checkoutHandler.Pay)
			chk.Get("/promptpay/{orderNumber}", checkoutHandler.GetPromptPayQR)
			chk.Get("/installments/{satangAmount}", checkoutHandler.CalculateInstallments)
		})

		// Orders
		api.Get("/orders/{orderNumber}", checkoutHandler.GetOrder)

		// Admin Backoffice (Protected by Admin Role)
		api.Route("/admin", func(adm chi.Router) {
			adm.Use(appMiddleware.RequireAdmin)
			adm.Get("/overview", adminHandler.GetOverview)
			adm.Post("/banners", adminHandler.CreateBanner)
			adm.Post("/products", adminHandler.CreateProduct)
			adm.Patch("/orders/{id}/status", adminHandler.UpdateOrderStatus)
		})
	})

	// Background worker: Periodically release expired 15-minute stock reservations
	ctxWorker, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()

	if db != nil {
		go func() {
			ticker := time.NewTicker(1 * time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					if released, err := orderRepo.ReleaseExpiredReservations(ctxWorker); err == nil && released > 0 {
						slog.Info("released expired stock reservations", "count", released)
					}
				case <-ctxWorker.Done():
					return
				}
			}
		}()
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.APIPort),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("http server listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed to start", "error", err)
			os.Exit(1)
		}
	}()

	<-stopChan
	slog.Info("shutdown signal received, gracefully draining connections...")

	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()

	if err := server.Shutdown(ctxShutdown); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("server shutdown gracefully completed")
}
