package database

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func SeedAll(db *gorm.DB) error {
	slog.Info("starting idempotent database seeding...")

	if err := AutoMigrate(db); err != nil {
		return fmt.Errorf("auto-migration failed prior to seeding: %w", err)
	}

	if err := seedUsers(db); err != nil {
		return fmt.Errorf("seed users failed: %w", err)
	}

	if err := seedBanners(db); err != nil {
		return fmt.Errorf("seed banners failed: %w", err)
	}

	catMap, err := seedCategories(db)
	if err != nil {
		return fmt.Errorf("seed categories failed: %w", err)
	}

	brandMap, err := seedBrands(db)
	if err != nil {
		return fmt.Errorf("seed brands failed: %w", err)
	}

	if err := seedProductsAndVariants(db, catMap, brandMap); err != nil {
		return fmt.Errorf("seed products & variants failed: %w", err)
	}

	slog.Info("database seeding completed successfully with all realistic datasets")
	return nil
}

func seedUsers(db *gorm.DB) error {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash seed password: %w", err)
	}
	hashStr := string(hashedPassword)

	users := []models.User{
		{
			Email:        "admin@auratech.co.th",
			PasswordHash: hashStr,
			FullName:     "AURA Administrator",
			Phone:        "02-118-9999",
			Role:         "ADMIN",
		},
		{
			Email:        "demo@auratech.co.th",
			PasswordHash: hashStr,
			FullName:     "Somchai Techlover",
			Phone:        "089-123-4567",
			Role:         "CUSTOMER",
		},
	}

	for _, u := range users {
		var existing models.User
		if err := db.Where("email = ?", u.Email).First(&existing).Error; err != nil {
			if err := db.Create(&u).Error; err != nil {
				return fmt.Errorf("failed to create user %s: %w", u.Email, err)
			}
			slog.Info("seeded user account", "email", u.Email, "role", u.Role)
		} else {
			existing.FullName = u.FullName
			existing.Phone = u.Phone
			existing.Role = u.Role
			existing.PasswordHash = hashStr
			if err := db.Save(&existing).Error; err != nil {
				return fmt.Errorf("failed to update user %s: %w", u.Email, err)
			}
		}
	}
	return nil
}

func seedBanners(db *gorm.DB) error {
	now := time.Now().UTC()
	startAt := now.Add(-24 * time.Hour)
	endAt := now.Add(365 * 24 * time.Hour)

	banners := []models.Banner{
		{
			Placement:        "TOP_RIBBON",
			GridSpan:         "col-span-1 row-span-1",
			ThemeMode:        "DARK",
			BackgroundColor:  "#18181B",
			BadgeText:        "STOREWIDE",
			Headline:         "⚡ FLASH TECH FEST: 0% Installment up to 10 Months + Free 3-Hour Express Delivery on all MacBook M4 models",
			Subheadline:      "Valid across Bangkok metropolitan areas. T&C apply.",
			ProductImageURL:  "",
			CTAPrimaryText:   "Explore Catalog",
			CTAPrimaryLink:   "/catalog?category=mac",
			CTASecondaryText: "",
			CTASecondaryLink: "",
			SortOrder:        0,
			IsActive:         true,
			StartAt:          startAt,
			EndAt:            endAt,
		},
		{
			Placement:        "HERO_SPLIT",
			GridSpan:         "col-span-2 row-span-2",
			ThemeMode:        "DARK",
			BackgroundColor:  "#090A0F",
			BadgeText:        "NEW M4 PRO CHIP",
			Headline:         "MacBook Pro 14 with M4 Pro",
			Subheadline:      "Mind-blowing performance. Up to 24 hrs battery. Liquid Retina XDR.",
			ProductImageURL:  "http://localhost:9000/aura-assets/banners/macbook-pro-14-with-m4-pro.png",
			CTAPrimaryText:   "Configure Now",
			CTAPrimaryLink:   "/products/macbook-pro-14-m4",
			CTASecondaryText: "Browse Mac Lineup",
			CTASecondaryLink: "/catalog?category=mac",
			SortOrder:        1,
			IsActive:         true,
			StartAt:          startAt,
			EndAt:            endAt,
		},
		{
			Placement:        "BENTO_GRID",
			GridSpan:         "col-span-2 row-span-2",
			ThemeMode:        "DARK",
			BackgroundColor:  "#0B0F19",
			BadgeText:        "240HZ OLED DISPLAY",
			Headline:         "ROG Zephyrus G16 OLED",
			Subheadline:      "Precision-engineered aluminum gaming & creator powerhouse with RTX 4080.",
			ProductImageURL:  "http://localhost:9000/aura-assets/banners/rog-zephyrus-g16-oled.png",
			CTAPrimaryText:   "Explore ROG",
			CTAPrimaryLink:   "/products/asus-rog-zephyrus-g16-oled",
			CTASecondaryText: "Gaming Laptops",
			CTASecondaryLink: "/catalog?category=gaming-laptops",
			SortOrder:        2,
			IsActive:         true,
			StartAt:          startAt,
			EndAt:            endAt,
		},
		{
			Placement:        "BENTO_GRID",
			GridSpan:         "col-span-2 row-span-1",
			ThemeMode:        "LIGHT",
			BackgroundColor:  "#F4F4F5",
			BadgeText:        "EDUCATION PRICING",
			Headline:         "Back to University Savings",
			Subheadline:      "Save up to ฿5,500 on MacBook Air M3 with student identification.",
			ProductImageURL:  "http://localhost:9000/aura-assets/banners/back-to-university-savings.png",
			CTAPrimaryText:   "Claim Student Deal",
			CTAPrimaryLink:   "/products/macbook-air-13-m3",
			CTASecondaryText: "Learn More",
			CTASecondaryLink: "/catalog",
			SortOrder:        3,
			IsActive:         true,
			StartAt:          startAt,
			EndAt:            endAt,
		},
	}

	for _, b := range banners {
		var existing models.Banner
		if err := db.Where("headline = ?", b.Headline).First(&existing).Error; err != nil {
			if err := db.Create(&b).Error; err != nil {
				return fmt.Errorf("failed to create banner %s: %w", b.Headline, err)
			}
			slog.Info("seeded banner", "placement", b.Placement, "headline", b.Headline)
		} else {
			existing.Placement = b.Placement
			existing.GridSpan = b.GridSpan
			existing.ThemeMode = b.ThemeMode
			existing.BackgroundColor = b.BackgroundColor
			existing.BadgeText = b.BadgeText
			existing.Subheadline = b.Subheadline
			existing.ProductImageURL = b.ProductImageURL
			existing.CTAPrimaryText = b.CTAPrimaryText
			existing.CTAPrimaryLink = b.CTAPrimaryLink
			existing.CTASecondaryText = b.CTASecondaryText
			existing.CTASecondaryLink = b.CTASecondaryLink
			existing.SortOrder = b.SortOrder
			existing.IsActive = b.IsActive
			existing.StartAt = b.StartAt
			existing.EndAt = b.EndAt
			if err := db.Save(&existing).Error; err != nil {
				return fmt.Errorf("failed to update banner %s: %w", b.Headline, err)
			}
		}
	}
	return nil
}

func seedCategories(db *gorm.DB) (map[string]uuid.UUID, error) {
	categories := []models.Category{
		{Slug: "mac", Name: "MacBook & Apple", IconName: "Laptop", SortOrder: 1},
		{Slug: "ultrabooks", Name: "Windows Ultrabooks", IconName: "Laptop2", SortOrder: 2},
		{Slug: "gaming-laptops", Name: "Gaming Laptops", IconName: "Gamepad2", SortOrder: 3},
		{Slug: "monitors", Name: "Pro Creator Monitors", IconName: "Monitor", SortOrder: 4},
		{Slug: "accessories", Name: "Mechanical Keyboards & Gear", IconName: "Keyboard", SortOrder: 5},
	}

	catMap := make(map[string]uuid.UUID)
	for _, cat := range categories {
		var existing models.Category
		if err := db.Where("slug = ?", cat.Slug).First(&existing).Error; err != nil {
			if err := db.Create(&cat).Error; err != nil {
				return nil, fmt.Errorf("failed to create category %s: %w", cat.Slug, err)
			}
			catMap[cat.Slug] = cat.ID
			slog.Info("seeded category", "slug", cat.Slug, "name", cat.Name)
		} else {
			existing.Name = cat.Name
			existing.IconName = cat.IconName
			existing.SortOrder = cat.SortOrder
			_ = db.Save(&existing)
			catMap[cat.Slug] = existing.ID
		}
	}
	return catMap, nil
}

func seedBrands(db *gorm.DB) (map[string]uuid.UUID, error) {
	brands := []models.Brand{
		{Slug: "apple", Name: "Apple", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg"},
		{Slug: "asus", Name: "ASUS ROG", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/2/2e/ASUS_Logo.svg"},
		{Slug: "lenovo", Name: "Lenovo", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/b/b8/Lenovo_logo_2015.svg"},
		{Slug: "lg", Name: "LG Electronics", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/b/bf/LG_logo_%282015%29.svg"},
		{Slug: "keychron", Name: "Keychron", LogoURL: "https://www.keychron.com/cdn/shop/files/Keychron_Logo_black_180x.png"},
	}

	brandMap := make(map[string]uuid.UUID)
	for _, b := range brands {
		var existing models.Brand
		if err := db.Where("slug = ?", b.Slug).First(&existing).Error; err != nil {
			if err := db.Create(&b).Error; err != nil {
				return nil, fmt.Errorf("failed to create brand %s: %w", b.Slug, err)
			}
			brandMap[b.Slug] = b.ID
			slog.Info("seeded brand", "slug", b.Slug, "name", b.Name)
		} else {
			existing.Name = b.Name
			existing.LogoURL = b.LogoURL
			_ = db.Save(&existing)
			brandMap[b.Slug] = existing.ID
		}
	}
	return brandMap, nil
}

func seedProductsAndVariants(db *gorm.DB, catMap map[string]uuid.UUID, brandMap map[string]uuid.UUID) error {
	p1JSON := getMacBookPro14JSON()
	p2JSON := getMacBookAir13JSON()
	p3JSON := getAsusZephyrusJSON()
	p4JSON := getLenovoYogaJSON()
	p5JSON := getLGMonitorJSON()
	p6JSON := getKeychronKeyboardJSON()

	productsData := []struct {
		Product  models.Product
		Variants []models.ProductVariant
	}{
		{
			Product: models.Product{
				Slug:             "macbook-pro-14-m4",
				Name:             "MacBook Pro 14-inch (M4 / M4 Pro)",
				CategoryID:       catMap["mac"],
				BrandID:          brandMap["apple"],
				Tagline:          "A work of smart. Pro at any speed.",
				ShortDescription: "The 14-inch MacBook Pro with M4 or M4 Pro chip delivers outrageous speed, up to 24 hours of battery life, Liquid Retina XDR display with nano-texture option, and advanced connectivity with Thunderbolt 5.",
				BasePrice:        5990000,
				UsagePersonas:    datatypes.JSON(p1JSON.Personas),
				BentoHighlights:  datatypes.JSON(p1JSON.Bento),
				BoxContents:      datatypes.JSON(p1JSON.Box),
				PortsDiagram:     datatypes.JSON(p1JSON.Ports),
				FullSpecMatrix:   datatypes.JSON(p1JSON.Specs),
				IsActive:         true,
			},
			Variants: []models.ProductVariant{
				{
					SKU:           "MBP14-M4-16-512-SB",
					ColorName:     "Space Black",
					ColorHex:      "#2E2C2E",
					Price:         5990000,
					ComparePrice:  6290000,
					StockQuantity: 8,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M4",
						"cpu_detail": "10-core CPU / 10-core GPU",
						"ram_gb": 16,
						"storage_gb": 512,
						"screen_size_inch": 14.2,
						"panel_type": "Liquid Retina XDR",
						"refresh_rate_hz": 120,
						"weight_kg": 1.55,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-pro-14-m4/MBP14-M4-16-512-SB.png"
					]`),
				},
				{
					SKU:           "MBP14-M4-16-512-SL",
					ColorName:     "Silver",
					ColorHex:      "#E3E4E5",
					Price:         5990000,
					ComparePrice:  6290000,
					StockQuantity: 5,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M4",
						"cpu_detail": "10-core CPU / 10-core GPU",
						"ram_gb": 16,
						"storage_gb": 512,
						"screen_size_inch": 14.2,
						"panel_type": "Liquid Retina XDR",
						"refresh_rate_hz": 120,
						"weight_kg": 1.55,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-pro-14-m4/MBP14-M4-16-512-SL.png"
					]`),
				},
				{
					SKU:           "MBP14-M4P-24-512-SB",
					ColorName:     "Space Black",
					ColorHex:      "#2E2C2E",
					Price:         7390000,
					ComparePrice:  7690000,
					StockQuantity: 4,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M4 Pro",
						"cpu_detail": "12-core CPU / 16-core GPU",
						"ram_gb": 24,
						"storage_gb": 512,
						"screen_size_inch": 14.2,
						"panel_type": "Liquid Retina XDR",
						"refresh_rate_hz": 120,
						"weight_kg": 1.60,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-pro-14-m4/MBP14-M4P-24-512-SB.png"
					]`),
				},
				{
					SKU:           "MBP14-M4P-48-1TB-SB",
					ColorName:     "Space Black",
					ColorHex:      "#2E2C2E",
					Price:         9490000,
					ComparePrice:  9990000,
					StockQuantity: 1,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M4 Pro",
						"cpu_detail": "14-core CPU / 20-core GPU",
						"ram_gb": 48,
						"storage_gb": 1024,
						"screen_size_inch": 14.2,
						"panel_type": "Liquid Retina XDR",
						"refresh_rate_hz": 120,
						"weight_kg": 1.62,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-pro-14-m4/MBP14-M4P-48-1TB-SB.png"
					]`),
				},
			},
		},
		{
			Product: models.Product{
				Slug:             "macbook-air-13-m3",
				Name:             "MacBook Air 13-inch (M3)",
				CategoryID:       catMap["mac"],
				BrandID:          brandMap["apple"],
				Tagline:          "Lean. Mean. M3 machine.",
				ShortDescription: "Supercharged by the next-generation M3 chip, the redesigned MacBook Air combines incredible performance with up to 18 hours of battery life into an impossibly thin aluminum enclosure.",
				BasePrice:        3990000,
				UsagePersonas:    datatypes.JSON(p2JSON.Personas),
				BentoHighlights:  datatypes.JSON(p2JSON.Bento),
				BoxContents:      datatypes.JSON(p2JSON.Box),
				PortsDiagram:     datatypes.JSON(p2JSON.Ports),
				FullSpecMatrix:   datatypes.JSON(p2JSON.Specs),
				IsActive:         true,
			},
			Variants: []models.ProductVariant{
				{
					SKU:           "MBA13-M3-16-256-MN",
					ColorName:     "Midnight",
					ColorHex:      "#2E3642",
					Price:         3990000,
					ComparePrice:  4190000,
					StockQuantity: 10,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M3",
						"cpu_detail": "8-core CPU / 8-core GPU",
						"ram_gb": 16,
						"storage_gb": 256,
						"screen_size_inch": 13.6,
						"panel_type": "Liquid Retina",
						"refresh_rate_hz": 60,
						"weight_kg": 1.24,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-air-13-m3/MBA13-M3-16-256-MN.png"
					]`),
				},
				{
					SKU:           "MBA13-M3-16-512-SL",
					ColorName:     "Silver",
					ColorHex:      "#E3E4E5",
					Price:         4690000,
					ComparePrice:  4890000,
					StockQuantity: 6,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M3",
						"cpu_detail": "8-core CPU / 10-core GPU",
						"ram_gb": 16,
						"storage_gb": 512,
						"screen_size_inch": 13.6,
						"panel_type": "Liquid Retina",
						"refresh_rate_hz": 60,
						"weight_kg": 1.24,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-air-13-m3/MBA13-M3-16-512-SL.png"
					]`),
				},
				{
					SKU:           "MBA13-M3-24-512-ST",
					ColorName:     "Starlight",
					ColorHex:      "#F0E4D3",
					Price:         5390000,
					ComparePrice:  5690000,
					StockQuantity: 4,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Apple M3",
						"cpu_detail": "8-core CPU / 10-core GPU",
						"ram_gb": 24,
						"storage_gb": 512,
						"screen_size_inch": 13.6,
						"panel_type": "Liquid Retina",
						"refresh_rate_hz": 60,
						"weight_kg": 1.24,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/macbook-air-13-m3/MBA13-M3-24-512-ST.png"
					]`),
				},
			},
		},
		{
			Product: models.Product{
				Slug:             "asus-rog-zephyrus-g16-oled",
				Name:             "ASUS ROG Zephyrus G16 (2024) GU605 OLED",
				CategoryID:       catMap["gaming-laptops"],
				BrandID:          brandMap["asus"],
				Tagline:          "Transcendent Power. OLED Precision.",
				ShortDescription: "Ultra-slim CNC machined aluminum gaming notebook packed with up to an Intel Core Ultra 9 processor, NVIDIA GeForce RTX 4080 Laptop GPU, and breathtaking 2.5K 240Hz ROG Nebula OLED display with G-SYNC.",
				BasePrice:        8999000,
				UsagePersonas:    datatypes.JSON(p3JSON.Personas),
				BentoHighlights:  datatypes.JSON(p3JSON.Bento),
				BoxContents:      datatypes.JSON(p3JSON.Box),
				PortsDiagram:     datatypes.JSON(p3JSON.Ports),
				FullSpecMatrix:   datatypes.JSON(p3JSON.Specs),
				IsActive:         true,
			},
			Variants: []models.ProductVariant{
				{
					SKU:           "ROG-G16-U9-4070-GY",
					ColorName:     "Eclipse Gray",
					ColorHex:      "#3A3B3C",
					Price:         8999000,
					ComparePrice:  9499000,
					StockQuantity: 6,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Intel Core Ultra 9",
						"cpu_detail": "Intel Core Ultra 9 185H / RTX 4070 8GB",
						"ram_gb": 32,
						"storage_gb": 1024,
						"screen_size_inch": 16.0,
						"panel_type": "ROG Nebula OLED",
						"refresh_rate_hz": 240,
						"weight_kg": 1.85,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/asus-rog-zephyrus-g16-oled/ROG-G16-U9-4070-GY.png"
					]`),
				},
				{
					SKU:           "ROG-G16-U9-4080-WH",
					ColorName:     "Platinum White",
					ColorHex:      "#F2F3F4",
					Price:         11499000,
					ComparePrice:  11999000,
					StockQuantity: 2,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Intel Core Ultra 9",
						"cpu_detail": "Intel Core Ultra 9 185H / RTX 4080 12GB",
						"ram_gb": 32,
						"storage_gb": 2048,
						"screen_size_inch": 16.0,
						"panel_type": "ROG Nebula OLED",
						"refresh_rate_hz": 240,
						"weight_kg": 1.85,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/asus-rog-zephyrus-g16-oled/ROG-G16-U9-4080-WH.png"
					]`),
				},
			},
		},
		{
			Product: models.Product{
				Slug:             "lenovo-yoga-slim-7i-aura",
				Name:             "Lenovo Yoga Slim 7i Aura Edition 15\"",
				CategoryID:       catMap["ultrabooks"],
				BrandID:          brandMap["lenovo"],
				Tagline:          "Smarter Than Ever with Intel Lunar Lake AI",
				ShortDescription: "Co-engineered with Intel for unprecedented AI-driven efficiency. Features Lunar Lake architecture, 15.3-inch 2.8K 120Hz PureSight Pro display, 70Wh long-lasting battery, and smart Mode switching.",
				BasePrice:        4299000,
				UsagePersonas:    datatypes.JSON(p4JSON.Personas),
				BentoHighlights:  datatypes.JSON(p4JSON.Bento),
				BoxContents:      datatypes.JSON(p4JSON.Box),
				PortsDiagram:     datatypes.JSON(p4JSON.Ports),
				FullSpecMatrix:   datatypes.JSON(p4JSON.Specs),
				IsActive:         true,
			},
			Variants: []models.ProductVariant{
				{
					SKU:           "YOGA-7I-U7-16-512-LG",
					ColorName:     "Luna Grey",
					ColorHex:      "#6D7175",
					Price:         4299000,
					ComparePrice:  4599000,
					StockQuantity: 8,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Intel Core Ultra 7",
						"cpu_detail": "Intel Core Ultra 7 258V / Intel Arc 140V",
						"ram_gb": 16,
						"storage_gb": 512,
						"screen_size_inch": 15.3,
						"panel_type": "PureSight Pro IPS",
						"refresh_rate_hz": 120,
						"weight_kg": 1.46,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/lenovo-yoga-slim-7i-aura/YOGA-7I-U7-16-512-LG.png"
					]`),
				},
				{
					SKU:           "YOGA-7I-U7-32-1TB-LG",
					ColorName:     "Luna Grey",
					ColorHex:      "#6D7175",
					Price:         4999000,
					ComparePrice:  5299000,
					StockQuantity: 3,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Intel Core Ultra 7",
						"cpu_detail": "Intel Core Ultra 7 258V / Intel Arc 140V",
						"ram_gb": 32,
						"storage_gb": 1024,
						"screen_size_inch": 15.3,
						"panel_type": "PureSight Pro IPS",
						"refresh_rate_hz": 120,
						"weight_kg": 1.46,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/lenovo-yoga-slim-7i-aura/YOGA-7I-U7-32-1TB-LG.png"
					]`),
				},
			},
		},
		{
			Product: models.Product{
				Slug:             "lg-ultrafine-27-5k",
				Name:             "LG UltraFine 27\" 5K USB-C / Thunderbolt Pro Monitor",
				CategoryID:       catMap["monitors"],
				BrandID:          brandMap["lg"],
				Tagline:          "Flawless Color Accuracy for Creative Professionals",
				ShortDescription: "With over 14.7 million pixels, DCI-P3 99% color gamut coverage, 500 nits brightness, integrated stereo speakers, mic, camera, and 94W Thunderbolt power delivery, this 5K monitor is the ultimate studio display companion.",
				BasePrice:        2490000,
				UsagePersonas:    datatypes.JSON(p5JSON.Personas),
				BentoHighlights:  datatypes.JSON(p5JSON.Bento),
				BoxContents:      datatypes.JSON(p5JSON.Box),
				PortsDiagram:     datatypes.JSON(p5JSON.Ports),
				FullSpecMatrix:   datatypes.JSON(p5JSON.Specs),
				IsActive:         true,
			},
			Variants: []models.ProductVariant{
				{
					SKU:           "LG-27MD5KL-B",
					ColorName:     "Matte Black",
					ColorHex:      "#1A1A1A",
					Price:         2490000,
					ComparePrice:  2690000,
					StockQuantity: 12,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "Integrated Display Engine",
						"cpu_detail": "27-inch 5120x2880 Nano IPS Panel",
						"ram_gb": 0,
						"storage_gb": 0,
						"screen_size_inch": 27.0,
						"panel_type": "Nano IPS 5K",
						"refresh_rate_hz": 60,
						"weight_kg": 8.50,
						"has_thunderbolt": true
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/lg-ultrafine-27-5k/LG-27MD5KL-B.png"
					]`),
				},
			},
		},
		{
			Product: models.Product{
				Slug:             "keychron-q1-pro-wireless",
				Name:             "Keychron Q1 Pro QMK/VIA Wireless Custom Mechanical Keyboard",
				CategoryID:       catMap["accessories"],
				BrandID:          brandMap["keychron"],
				Tagline:          "Full CNC Aluminum Body. Hot-Swappable Pro Mechanical Experience.",
				ShortDescription: "A fully customizable 75% mechanical keyboard engineered with CNC anodized aluminum, double-gasket design, Bluetooth 5.1 wireless + Type-C wired modes, South-facing RGB, and full QMK/VIA keymapping support.",
				BasePrice:        729000,
				UsagePersonas:    datatypes.JSON(p6JSON.Personas),
				BentoHighlights:  datatypes.JSON(p6JSON.Bento),
				BoxContents:      datatypes.JSON(p6JSON.Box),
				PortsDiagram:     datatypes.JSON(p6JSON.Ports),
				FullSpecMatrix:   datatypes.JSON(p6JSON.Specs),
				IsActive:         true,
			},
			Variants: []models.ProductVariant{
				{
					SKU:           "Q1P-KPRO-RED-CB",
					ColorName:     "Carbon Black",
					ColorHex:      "#242526",
					Price:         729000,
					ComparePrice:  769000,
					StockQuantity: 15,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "ARM Cortex-M4 32-bit",
						"cpu_detail": "Keychron K Pro Red Linear Switches",
						"ram_gb": 0,
						"storage_gb": 0,
						"screen_size_inch": 0,
						"panel_type": "PBT Double-Shot KSA Profile",
						"refresh_rate_hz": 1000,
						"weight_kg": 1.73,
						"has_thunderbolt": false
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/keychron-q1-pro-wireless/Q1P-KPRO-RED-CB.png"
					]`),
				},
				{
					SKU:           "Q1P-KPRO-BAN-SW",
					ColorName:     "Shell White",
					ColorHex:      "#FAFAFA",
					Price:         729000,
					ComparePrice:  769000,
					StockQuantity: 10,
					ReservedStock: 0,
					Specs: datatypes.JSON(`{
						"cpu_family": "ARM Cortex-M4 32-bit",
						"cpu_detail": "Keychron K Pro Banana Early Tactile",
						"ram_gb": 0,
						"storage_gb": 0,
						"screen_size_inch": 0,
						"panel_type": "PBT Double-Shot KSA Profile",
						"refresh_rate_hz": 1000,
						"weight_kg": 1.73,
						"has_thunderbolt": false
					}`),
					Images: datatypes.JSON(`[
						"http://localhost:9000/aura-assets/products/keychron-q1-pro-wireless/Q1P-KPRO-BAN-SW.png"
					]`),
				},
			},
		},
	}

	createdProductMap := make(map[string]uuid.UUID)

	for _, item := range productsData {
		var existingProd models.Product
		if err := db.Where("slug = ?", item.Product.Slug).First(&existingProd).Error; err != nil {
			if err := db.Create(&item.Product).Error; err != nil {
				return fmt.Errorf("failed to create product %s: %w", item.Product.Slug, err)
			}
			createdProductMap[item.Product.Slug] = item.Product.ID
			slog.Info("seeded product", "slug", item.Product.Slug, "name", item.Product.Name)
		} else {
			existingProd.Name = item.Product.Name
			existingProd.CategoryID = item.Product.CategoryID
			existingProd.BrandID = item.Product.BrandID
			existingProd.Tagline = item.Product.Tagline
			existingProd.ShortDescription = item.Product.ShortDescription
			existingProd.BasePrice = item.Product.BasePrice
			existingProd.UsagePersonas = item.Product.UsagePersonas
			existingProd.BentoHighlights = item.Product.BentoHighlights
			existingProd.BoxContents = item.Product.BoxContents
			existingProd.PortsDiagram = item.Product.PortsDiagram
			existingProd.FullSpecMatrix = item.Product.FullSpecMatrix
			existingProd.IsActive = item.Product.IsActive
			_ = db.Save(&existingProd)
			createdProductMap[item.Product.Slug] = existingProd.ID
		}

		prodID := createdProductMap[item.Product.Slug]
		for _, v := range item.Variants {
			v.ProductID = prodID
			var existingVar models.ProductVariant
			if err := db.Where("sku = ?", v.SKU).First(&existingVar).Error; err != nil {
				if err := db.Create(&v).Error; err != nil {
					return fmt.Errorf("failed to create variant %s: %w", v.SKU, err)
				}
				slog.Info("seeded variant", "sku", v.SKU, "price", v.Price, "stock", v.StockQuantity)
			} else {
				existingVar.ColorName = v.ColorName
				existingVar.ColorHex = v.ColorHex
				existingVar.Price = v.Price
				existingVar.ComparePrice = v.ComparePrice
				existingVar.StockQuantity = v.StockQuantity
				existingVar.ReservedStock = v.ReservedStock
				existingVar.Specs = v.Specs
				existingVar.Images = v.Images
				_ = db.Save(&existingVar)
			}
		}
	}

	// Seed Frequently Bought Together Bundles
	mbpID := createdProductMap["macbook-pro-14-m4"]
	mbaID := createdProductMap["macbook-air-13-m3"]
	asusID := createdProductMap["asus-rog-zephyrus-g16-oled"]
	yogaID := createdProductMap["lenovo-yoga-slim-7i-aura"]
	keyboardID := createdProductMap["keychron-q1-pro-wireless"]
	monitorID := createdProductMap["lg-ultrafine-27-5k"]

	bundles := []models.ProductAccessoryBundle{
		// MacBook Pro 14
		{MainProductID: mbpID, AccessoryProductID: keyboardID, BundleDiscountPct: 10},
		{MainProductID: mbpID, AccessoryProductID: monitorID, BundleDiscountPct: 10},
		// MacBook Air 13
		{MainProductID: mbaID, AccessoryProductID: keyboardID, BundleDiscountPct: 10},
		{MainProductID: mbaID, AccessoryProductID: monitorID, BundleDiscountPct: 10},
		// ASUS ROG Zephyrus G16
		{MainProductID: asusID, AccessoryProductID: keyboardID, BundleDiscountPct: 10},
		{MainProductID: asusID, AccessoryProductID: monitorID, BundleDiscountPct: 10},
		// Lenovo Yoga Slim 7i Aura Edition
		{MainProductID: yogaID, AccessoryProductID: keyboardID, BundleDiscountPct: 10},
		{MainProductID: yogaID, AccessoryProductID: monitorID, BundleDiscountPct: 10},
	}

	for _, b := range bundles {
		var existing models.ProductAccessoryBundle
		if err := db.Where("main_product_id = ? AND accessory_product_id = ?", b.MainProductID, b.AccessoryProductID).First(&existing).Error; err != nil {
			_ = db.Clauses(clause.OnConflict{DoNothing: true}).Create(&b)
			slog.Info("seeded accessory bundle", "main", b.MainProductID, "accessory", b.AccessoryProductID)
		}
	}

	return nil
}

type productJSONPayload struct {
	Personas []byte
	Bento    []byte
	Box      []byte
	Ports    []byte
	Specs    []byte
}

func getMacBookPro14JSON() productJSONPayload {
	personas, _ := json.Marshal([]string{"CREATOR", "ULTRALIGHT", "OFFICE"})
	bento, _ := json.Marshal([]map[string]any{
		{"id": "b1", "span": "col-span-2", "icon": "BatteryCharging", "eyebrow": "BATTERY LIFE", "big_metric": "Up to 24 hrs", "title": "Longest battery life ever in a Mac", "description": "Go all day and night on a single charge with Apple silicon industry-leading power efficiency."},
		{"id": "b2", "span": "col-span-1", "icon": "Cpu", "eyebrow": "M4 PRO SILICON", "big_metric": "Up to 14-Core CPU", "title": "Pro speed that crushes heavy workloads", "description": "Up to 20-core GPU with hardware-accelerated ray tracing and Neural Engine for on-device AI."},
		{"id": "b3", "span": "col-span-1", "icon": "Monitor", "eyebrow": "LIQUID RETINA XDR", "big_metric": "1,600 nits", "title": "Peak HDR brightness with 120Hz ProMotion", "description": "Extreme Dynamic Range with 1,000,000:1 contrast ratio and nano-texture display option."},
		{"id": "b4", "span": "col-span-1", "icon": "Wifi", "eyebrow": "THUNDERBOLT 5", "big_metric": "120 Gb/s", "title": "Next-gen high speed data and triple displays", "description": "Up to 3x faster transfer speeds for external PCIe storage and multi-monitor workstations."},
		{"id": "b5", "span": "col-span-1", "icon": "Sparkles", "eyebrow": "APPLE INTELLIGENCE", "big_metric": "On-Device AI", "title": "Personal, private, powerful intelligence", "description": "Transform writing, summarize notifications, and generate images with breakthrough privacy."},
		{"id": "b6", "span": "col-span-2", "icon": "Feather", "eyebrow": "THERMAL ARCHITECTURE", "big_metric": "Whisper Quiet", "title": "Advanced thermal cooling maintains peak sustained clock speeds", "description": "The innovative cooling system moves 50% more air quietly while handling high sustained GPU rendering."},
	})
	box, _ := json.Marshal([]map[string]string{
		{"name": "14-inch MacBook Pro", "icon": "Laptop"},
		{"name": "70W USB-C Power Adapter (or 96W for M4 Pro)", "icon": "Plug"},
		{"name": "USB-C to MagSafe 3 Cable (2 m)", "icon": "Cable"},
		{"name": "Polishing Cloth & Warranty Documentation", "icon": "Sparkles"},
	})
	ports, _ := json.Marshal(map[string]any{
		"left_ports": []map[string]string{
			{"name": "MagSafe 3", "spec": "High-speed fast charging up to 50% in 30 minutes"},
			{"name": "2x Thunderbolt 5 (USB-C)", "spec": "Up to 120Gb/s transfer, DisplayPort 2.1, Power Delivery"},
			{"name": "3.5mm Headphone Jack", "spec": "Advanced support for high-impedance headphones"},
		},
		"right_ports": []map[string]string{
			{"name": "HDMI 2.1", "spec": "Supports up to 8K@60Hz or 4K@240Hz external displays"},
			{"name": "1x Thunderbolt 5 (USB-C)", "spec": "Up to 120Gb/s transfer, DisplayPort 2.1"},
			{"name": "SDXC Card Slot", "spec": "UHS-II protocol support up to 312MB/s"},
		},
	})
	specs, _ := json.Marshal([]map[string]any{
		{
			"category": "Processor & Memory",
			"rows": []map[string]string{
				{"label": "Chip", "value": "Apple M4 or Apple M4 Pro"},
				{"label": "CPU Cores", "value": "Up to 14 cores (10 performance and 4 efficiency)"},
				{"label": "GPU Cores", "value": "Up to 20 cores with hardware ray tracing"},
				{"label": "Neural Engine", "value": "16-core Neural Engine (38 TOPS)"},
				{"label": "Unified Memory", "value": "16GB, 24GB, or 48GB (up to 273GB/s bandwidth)"},
			},
		},
		{
			"category": "Display",
			"rows": []map[string]string{
				{"label": "Screen Size", "value": "14.2-inch Liquid Retina XDR"},
				{"label": "Native Resolution", "value": "3024 x 1964 at 254 pixels per inch"},
				{"label": "Refresh Rate", "value": "ProMotion adaptive refresh up to 120Hz"},
				{"label": "Peak Brightness", "value": "1,600 nits peak HDR / 1,000 nits sustained"},
				{"label": "Color Support", "value": "Wide color (P3), True Tone technology"},
			},
		},
		{
			"category": "Battery & Power",
			"rows": []map[string]string{
				{"label": "Battery Life", "value": "Up to 24 hours Apple TV video playback"},
				{"label": "Battery Capacity", "value": "72.4-watt-hour lithium-polymer battery"},
				{"label": "Charging", "value": "Fast-charge capable with 96W USB-C Power Adapter"},
			},
		},
		{
			"category": "Dimensions & Weight",
			"rows": []map[string]string{
				{"label": "Height", "value": "1.55 cm (0.61 inch)"},
				{"label": "Width", "value": "31.26 cm (12.31 inches)"},
				{"label": "Depth", "value": "22.12 cm (8.71 inches)"},
				{"label": "Weight", "value": "1.60 kg (3.53 pounds)"},
			},
		},
	})
	return productJSONPayload{Personas: personas, Bento: bento, Box: box, Ports: ports, Specs: specs}
}

func getMacBookAir13JSON() productJSONPayload {
	personas, _ := json.Marshal([]string{"ULTRALIGHT", "OFFICE"})
	bento, _ := json.Marshal([]map[string]any{
		{"id": "b1", "span": "col-span-2", "icon": "Feather", "eyebrow": "PORTABILITY", "big_metric": "1.24 kg", "title": "Strikingly thin design ready to go anywhere", "description": "Less than half an inch thin so you can slip it into your backpack effortlessly."},
		{"id": "b2", "span": "col-span-1", "icon": "Cpu", "eyebrow": "M3 PERFORMANCE", "big_metric": "Up to 60% Faster", "title": "Speed meets silent fanless operation", "description": "Blazing fast everyday computing and multitasking with zero fan noise."},
		{"id": "b3", "span": "col-span-1", "icon": "BatteryCharging", "eyebrow": "ALL-DAY BATTERY", "big_metric": "Up to 18 hrs", "title": "Leave your power brick at home", "description": "Incredible all-day battery endurance for campus, coffee shops, and travel."},
		{"id": "b4", "span": "col-span-1", "icon": "Monitor", "eyebrow": "DUAL DISPLAYS", "big_metric": "2 External Monitors", "title": "Supports two displays when laptop lid is closed", "description": "Connect dual high resolution monitors for expanded desktop productivity."},
		{"id": "b5", "span": "col-span-1", "icon": "Wifi", "eyebrow": "CONNECTIVITY", "big_metric": "Wi-Fi 6E", "title": "2x faster wireless connectivity", "description": "Enjoy smooth 4K streaming and high-speed cloud file synchronization."},
		{"id": "b6", "span": "col-span-2", "icon": "Sparkles", "eyebrow": "AUDIO & CAMERA", "big_metric": "1080p FaceTime HD", "title": "Three-mic array & Spatial Audio speakers", "description": "Look sharp on video calls and enjoy immersive Dolby Atmos entertainment."},
	})
	box, _ := json.Marshal([]map[string]string{
		{"name": "13-inch MacBook Air", "icon": "Laptop"},
		{"name": "30W USB-C Power Adapter", "icon": "Plug"},
		{"name": "USB-C to MagSafe 3 Cable (2 m)", "icon": "Cable"},
	})
	ports, _ := json.Marshal(map[string]any{
		"left_ports": []map[string]string{
			{"name": "MagSafe 3", "spec": "Dedicated magnetic charging port"},
			{"name": "2x Thunderbolt / USB 4", "spec": "Charging, DisplayPort, Thunderbolt 3 up to 40Gb/s"},
		},
		"right_ports": []map[string]string{
			{"name": "3.5mm Headphone Jack", "spec": "Advanced support for high-impedance headphones"},
		},
	})
	specs, _ := json.Marshal([]map[string]any{
		{
			"category": "Processor & Memory",
			"rows": []map[string]string{
				{"label": "Chip", "value": "Apple M3 chip (8-core CPU, up to 10-core GPU)"},
				{"label": "Memory", "value": "16GB or 24GB unified memory"},
				{"label": "Storage", "value": "256GB or 512GB fast SSD"},
			},
		},
		{
			"category": "Display",
			"rows": []map[string]string{
				{"label": "Screen Size", "value": "13.6-inch Liquid Retina display with True Tone"},
				{"label": "Resolution", "value": "2560 x 1664 at 224 pixels per inch"},
				{"label": "Brightness", "value": "500 nits brightness with P3 wide color"},
			},
		},
		{
			"category": "Dimensions & Weight",
			"rows": []map[string]string{
				{"label": "Thickness", "value": "1.13 cm (0.44 inch)"},
				{"label": "Weight", "value": "1.24 kg (2.7 pounds)"},
			},
		},
	})
	return productJSONPayload{Personas: personas, Bento: bento, Box: box, Ports: ports, Specs: specs}
}

func getAsusZephyrusJSON() productJSONPayload {
	personas, _ := json.Marshal([]string{"GAMING", "CREATOR"})
	bento, _ := json.Marshal([]map[string]any{
		{"id": "b1", "span": "col-span-2", "icon": "Monitor", "eyebrow": "ROG NEBULA OLED", "big_metric": "240Hz / 0.2ms", "title": "Breathtaking 2.5K OLED Gaming Panel", "description": "True blacks, VESA DisplayHDR True Black 500, 100% DCI-P3 color coverage and G-SYNC."},
		{"id": "b2", "span": "col-span-1", "icon": "Cpu", "eyebrow": "INTEL CORE ULTRA 9", "big_metric": "AI Boost NPU", "title": "16-core AI gaming powerhouse", "description": "High frame-rate gaming paired with dedicated neural processing unit for AI workloads."},
		{"id": "b3", "span": "col-span-1", "icon": "Sparkles", "eyebrow": "RTX 4080 GRAPHICS", "big_metric": "12GB GDDR6", "title": "Full DLSS 3.5 & Ray Tracing Support", "description": "Next-gen ray tracing performance with AI-powered neural rendering frame generation."},
		{"id": "b4", "span": "col-span-1", "icon": "Feather", "eyebrow": "CNC ALUMINUM", "big_metric": "1.85 kg / 1.49 cm", "title": "Sleek slash lighting aluminum chassis", "description": "Precision milled from a single block of aerospace aluminum alloy with customizable Slash lighting."},
		{"id": "b5", "span": "col-span-1", "icon": "BatteryCharging", "eyebrow": "ROG INTELLIGENT COOLING", "big_metric": "Tri-Fan Technology", "title": "Arc Flow Fans 2.0 with liquid metal", "description": "Keeps key components cool under heavy sustained gaming loads with 0dB ambient cooling."},
		{"id": "b6", "span": "col-span-2", "icon": "Wifi", "eyebrow": "AUDIO & PORTS", "big_metric": "6-Speaker Audio", "title": "Dolby Atmos woofer & full I/O connectivity", "description": "Dual force-canceling woofers paired with Thunderbolt 4, HDMI 2.1, and high-speed SD card reader."},
	})
	box, _ := json.Marshal([]map[string]string{
		{"name": "ROG Zephyrus G16 Laptop", "icon": "Laptop"},
		{"name": "240W AC Adapter", "icon": "Plug"},
		{"name": "100W USB-C Travel Charger", "icon": "Cable"},
		{"name": "ROG Sleeve Case", "icon": "Sparkles"},
	})
	ports, _ := json.Marshal(map[string]any{
		"left_ports": []map[string]string{
			{"name": "Power Jack (Slim)", "spec": "240W high capacity barrel connector"},
			{"name": "Thunderbolt 4", "spec": "Supports DisplayPort 2.1 and 100W Power Delivery"},
			{"name": "USB 3.2 Gen 2 Type-A", "spec": "10Gb/s high speed peripheral port"},
			{"name": "HDMI 2.1", "spec": "FRL support up to 4K@120Hz or 8K@60Hz"},
			{"name": "3.5mm Audio Combo Jack", "spec": "Headphone and microphone combo"},
		},
		"right_ports": []map[string]string{
			{"name": "USB 3.2 Gen 2 Type-C", "spec": "DisplayPort and Power Delivery support"},
			{"name": "USB 3.2 Gen 2 Type-A", "spec": "10Gb/s high speed peripheral port"},
			{"name": "SD Card Reader (SD Express 7.0)", "spec": "Ultra high-speed media transfer"},
		},
	})
	specs, _ := json.Marshal([]map[string]any{
		{
			"category": "Processor & Memory",
			"rows": []map[string]string{
				{"label": "Processor", "value": "Intel Core Ultra 9 185H (16 cores, up to 5.1GHz)"},
				{"label": "Graphics", "value": "NVIDIA GeForce RTX 4070 / RTX 4080 Laptop GPU"},
				{"label": "Memory", "value": "32GB LPDDR5X-7467 MHz"},
				{"label": "Storage", "value": "1TB or 2TB PCIe 4.0 NVMe M.2 SSD"},
			},
		},
		{
			"category": "Display",
			"rows": []map[string]string{
				{"label": "Size & Panel", "value": "16.0-inch 2.5K (2560 x 1600) ROG Nebula OLED"},
				{"label": "Refresh Rate", "value": "240Hz refresh rate, 0.2ms response time"},
				{"label": "Color & Certifications", "value": "100% DCI-P3, Pantone Validated, G-SYNC"},
			},
		},
	})
	return productJSONPayload{Personas: personas, Bento: bento, Box: box, Ports: ports, Specs: specs}
}

func getLenovoYogaJSON() productJSONPayload {
	personas, _ := json.Marshal([]string{"ULTRALIGHT", "OFFICE", "CREATOR"})
	bento, _ := json.Marshal([]map[string]any{
		{"id": "b1", "span": "col-span-2", "icon": "Cpu", "eyebrow": "LUNAR LAKE ARCHITECTURE", "big_metric": "Intel Core Ultra 7", "title": "Series 2 Next-Gen On-Chip RAM Design", "description": "Integrated on-package memory brings lightning low-latency responsiveness and extreme efficiency."},
		{"id": "b2", "span": "col-span-1", "icon": "Monitor", "eyebrow": "PURESIGHT PRO", "big_metric": "2.8K 120Hz", "title": "15.3-inch anti-glare display", "description": "Delta E < 1 color accuracy with 100% sRGB and P3 color space switching."},
		{"id": "b3", "span": "col-span-1", "icon": "Sparkles", "eyebrow": "AURA EDITION", "big_metric": "Smart Modes", "title": "Contextual AI adjusts battery, security & focus", "description": "Shield mode blurs display when strangers peek; Attention mode cuts digital distractions."},
		{"id": "b4", "span": "col-span-1", "icon": "BatteryCharging", "eyebrow": "LONG RUNTIME", "big_metric": "70Wh Battery", "title": "Over 20 hours video playback", "description": "Intelligent power scheduling extends battery life through full workdays effortlessly."},
		{"id": "b5", "span": "col-span-1", "icon": "Feather", "eyebrow": "DESIGN", "big_metric": "1.46 kg", "title": "Comfort-edge anodized aluminum", "description": "Smooth rounded edges with spill-resistant keyboard and oversized haptic glass touchpad."},
		{"id": "b6", "span": "col-span-2", "icon": "Wifi", "eyebrow": "CONNECTIVITY", "big_metric": "Dual Thunderbolt 4", "title": "Universal docking with 40Gbps bandwidth", "description": "Easily drive high-resolution monitors and access fast external SSD arrays."},
	})
	box, _ := json.Marshal([]map[string]string{
		{"name": "Lenovo Yoga Slim 7i Aura Edition", "icon": "Laptop"},
		{"name": "65W USB-C GaN Slim Charger", "icon": "Plug"},
		{"name": "USB-C to HDMI/VGA Hub", "icon": "Cable"},
	})
	ports, _ := json.Marshal(map[string]any{
		"left_ports": []map[string]string{
			{"name": "2x Thunderbolt 4", "spec": "Power Delivery 3.0, DisplayPort 1.4, 40Gbps"},
			{"name": "HDMI 2.1", "spec": "Supports up to 4K@60Hz"},
		},
		"right_ports": []map[string]string{
			{"name": "1x USB 3.2 Gen 1 Type-A", "spec": "Always-on charging support"},
			{"name": "E-Shutter Camera Switch", "spec": "Physical webcam privacy disconnection"},
			{"name": "3.5mm Audio Jack", "spec": "Headphone/microphone combo"},
		},
	})
	specs, _ := json.Marshal([]map[string]any{
		{
			"category": "Processor & Memory",
			"rows": []map[string]string{
				{"label": "Processor", "value": "Intel Core Ultra 7 258V (8 cores, 48 NPU TOPS)"},
				{"label": "Memory", "value": "16GB or 32GB on-package LPDDR5X"},
				{"label": "Storage", "value": "512GB or 1TB PCIe 4.0 NVMe SSD"},
			},
		},
	})
	return productJSONPayload{Personas: personas, Bento: bento, Box: box, Ports: ports, Specs: specs}
}

func getLGMonitorJSON() productJSONPayload {
	personas, _ := json.Marshal([]string{"CREATOR", "OFFICE"})
	bento, _ := json.Marshal([]map[string]any{
		{"id": "b1", "span": "col-span-2", "icon": "Monitor", "eyebrow": "5K RESOLUTION", "big_metric": "5120 x 2880", "title": "218 Pixels Per Inch Retina Clarity", "description": "Crisp text and true-to-life images with 50% more pixels than standard 4K displays."},
		{"id": "b2", "span": "col-span-1", "icon": "Sparkles", "eyebrow": "COLOR ACCURACY", "big_metric": "DCI-P3 99%", "title": "500 nits brightness with Nano IPS", "description": "Covers wide color spectrum ideal for video color grading and photography edit suites."},
		{"id": "b3", "span": "col-span-1", "icon": "Wifi", "eyebrow": "THUNDERBOLT 3", "big_metric": "94W Power Delivery", "title": "Single-cable docking for Mac and PC", "description": "Transmits 5K video, data, and up to 94W laptop charging through one Thunderbolt cable."},
		{"id": "b4", "span": "col-span-1", "icon": "BatteryCharging", "eyebrow": "USB-C HUB", "big_metric": "3x Downstream", "title": "Connect extra peripherals effortlessly", "description": "Built-in 3-port USB-C hub allows direct connection of external drives and input devices."},
		{"id": "b5", "span": "col-span-1", "icon": "Feather", "eyebrow": "AUDIO & WEBCAM", "big_metric": "Stereo & Mic", "title": "Integrated camera, microphone & Rich Bass speakers", "description": "Seamless video conferencing and clean desk setup with zero external accessories needed."},
		{"id": "b6", "span": "col-span-2", "icon": "Cpu", "eyebrow": "MAC INTEGRATION", "big_metric": "macOS Control", "title": "Control brightness and volume directly from Mac keyboard", "description": "Native macOS menu bar and keyboard shortcut integration without touching monitor buttons."},
	})
	box, _ := json.Marshal([]map[string]string{
		{"name": "LG UltraFine 27\" 5K Monitor", "icon": "Monitor"},
		{"name": "Power Cord", "icon": "Plug"},
		{"name": "Thunderbolt 3 Cable (2m)", "icon": "Cable"},
		{"name": "USB-C Cable", "icon": "Cable"},
		{"name": "Easy-Clip Stand Base", "icon": "Sparkles"},
	})
	ports, _ := json.Marshal(map[string]any{
		"left_ports": []map[string]string{},
		"right_ports": []map[string]string{
			{"name": "1x Thunderbolt 3 Upstream", "spec": "Up to 94W PD charging & 5K@60Hz video"},
			{"name": "3x USB-C Downstream", "spec": "USB 3.1 Gen 1 (5Gbps) for peripherals"},
		},
	})
	specs, _ := json.Marshal([]map[string]any{
		{
			"category": "Display Specifications",
			"rows": []map[string]string{
				{"label": "Screen Size", "value": "27-inch (68.29 cm)"},
				{"label": "Panel Type", "value": "Nano IPS"},
				{"label": "Resolution", "value": "5120 x 2880 (5K UHD)"},
				{"label": "Brightness", "value": "500 nits (Typical)"},
				{"label": "Contrast Ratio", "value": "1100:1 (Typical)"},
			},
		},
	})
	return productJSONPayload{Personas: personas, Bento: bento, Box: box, Ports: ports, Specs: specs}
}

func getKeychronKeyboardJSON() productJSONPayload {
	personas, _ := json.Marshal([]string{"OFFICE", "CREATOR", "GAMING"})
	bento, _ := json.Marshal([]map[string]any{
		{"id": "b1", "span": "col-span-2", "icon": "Feather", "eyebrow": "CNC CRAFTSMANSHIP", "big_metric": "6063 Aluminum", "title": "Full CNC Machined Aluminum Body", "description": "Every single metal part is polished, anodized, and sandblasted through 24 manufacturing stages."},
		{"id": "b2", "span": "col-span-1", "icon": "Wifi", "eyebrow": "WIRELESS & WIRED", "big_metric": "Bluetooth 5.1", "title": "Connect up to 3 devices simultaneously", "description": "Seamlessly switch between Mac, Windows, and iPad with reliable wireless connectivity."},
		{"id": "b3", "span": "col-span-1", "icon": "Cpu", "eyebrow": "QMK / VIA SUPPORT", "big_metric": "Open Source", "title": "Remap any key and macro in real time", "description": "Program key combinations and customize layers via web-based VIA configurator without reboot."},
		{"id": "b4", "span": "col-span-1", "icon": "Sparkles", "eyebrow": "DOUBLE GASKET", "big_metric": "Silicone Dampers", "title": "Enhanced acoustic typing sound profile", "description": "Double-gasket mount significantly reduces acoustic resonance for deep, clean tactile feedback."},
		{"id": "b5", "span": "col-span-1", "icon": "BatteryCharging", "eyebrow": "HOT-SWAPPABLE", "big_metric": "3-pin & 5-pin", "title": "Swap switches without soldering", "description": "Compatible with virtually all MX style mechanical switches on the market."},
		{"id": "b6", "span": "col-span-2", "icon": "Monitor", "eyebrow": "SOUTH-FACING RGB", "big_metric": "22+ Lighting Modes", "title": "Vibrant RGB illumination from typist angle", "description": "Designed to better illuminate keyboard backlighting when non-shine-through PBT keycaps are installed."},
	})
	box, _ := json.Marshal([]map[string]string{
		{"name": "Keychron Q1 Pro Assembled Keyboard", "icon": "Keyboard"},
		{"name": "Type-C to Type-C Cable", "icon": "Cable"},
		{"name": "Type-A to Type-C Adapter", "icon": "Cable"},
		{"name": "Switch Puller & Keycap Puller", "icon": "Sparkles"},
		{"name": "Screwdriver & Hex Key", "icon": "Sparkles"},
	})
	ports, _ := json.Marshal(map[string]any{
		"left_ports": []map[string]string{
			{"name": "Type-C Wired Port", "spec": "1000Hz polling rate in wired mode"},
			{"name": "Mac / Windows Toggle Switch", "spec": "Hardware OS key layout selector"},
			{"name": "BT / Off / Cable Mode Switch", "spec": "Three-way connection mode selector"},
		},
		"right_ports": []map[string]string{},
	})
	specs, _ := json.Marshal([]map[string]any{
		{
			"category": "General Specs",
			"rows": []map[string]string{
				{"label": "Layout", "value": "75% Exploded Layout (81 keys)"},
				{"label": "Connectivity", "value": "Bluetooth 5.1 & USB Type-C Wired"},
				{"label": "Battery", "value": "4000 mAh rechargeable Li-polymer (up to 300 hrs)"},
				{"label": "Body Material", "value": "Full CNC machined 6063 aluminum"},
				{"label": "Weight", "value": "1.73 kg (3.8 lbs)"},
			},
		},
	})
	return productJSONPayload{Personas: personas, Bento: bento, Box: box, Ports: ports, Specs: specs}
}
