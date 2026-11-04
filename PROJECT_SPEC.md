# AURA TECH — Flagship IT Gadget & Laptop E-Commerce Monorepo
## Master Technical Specification & Autonomous AI Execution Blueprint

> **AI AGENT DIRECTIVE (READ FIRST):**
> This document is the **Single Source of Truth (SSOT)** for building **AURA TECH**, a production-grade, Apple-inspired IT Gadget, MacBook, and High-Performance Notebook E-Commerce platform.
> When instructed to build or scaffold this project, you must follow the exact Monorepo structure, Docker ecosystem, Database schema, API contracts, UX/UI motion rules, and business logic defined below without omitting any features or cutting corners.

---

## 1. System Architecture & Technology Stack

### 1.1 Core Stack
* **Architecture:** Monorepo running 100% locally via Docker Compose (`postgres`, `minio`, `minio-init`, `api`, `web`).
* **Environment Strategy:** Single unified `.env` file at the monorepo root (copied from `.env.example`). No multi-environment splitting required.
* **Backend (`apps/api`):**
  * **Language:** Go 1.23+
  * **HTTP Router:** `github.com/go-chi/chi/v5` (with CORS, RequestID, RealIP, Recoverer, and Structured Logger middlewares)
  * **ORM:** GORM (`gorm.io/gorm`, `gorm.io/driver/postgres`, `gorm.io/datatypes` for `JSONB`)
  * **Authentication & Guest Tracking:** JWT (`github.com/golang-jwt/jwt/v5`) + `X-Guest-Session-ID` header / cookie middleware
  * **Object Storage Client:** `github.com/minio/minio-go/v7` (Presigned URLs & Public Asset URLs)
  * **Validation & Logging:** `github.com/go-playground/validator/v10` + Go standard `log/slog` (JSON structured logs)
  * **Hot Reload:** `air` (`github.com/air-verse/air`)
* **Frontend (`apps/web`):**
  * **Framework:** React 19 + TypeScript + Vite
  * **Routing & URL State:** TanStack Router (`@tanstack/react-router`) with strict Type-Safe Search Params for catalog filters
  * **Server State & Caching:** TanStack Query v5 (`@tanstack/react-query`) for intent-based prefetching and optimistic updates
  * **Client State:** Zustand (`zustand`) for Cart Drawer, Comparison Tray, Command Palette, and Auth/Session state
  * **Styling & UI Primitives:** Tailwind CSS v4 + `shadcn/ui` (Radix UI Primitives) + `lucide-react`
  * **Animation & Smooth Scroll:** Motion (`framer-motion` / `motion/react`) + `lenis` (strictly scoped smooth scrolling)
  * **Forms & Validation:** `react-hook-form` + `zod` + `@hookform/resolvers`
* **Infrastructure (`infra`):**
  * **Database:** PostgreSQL 16 Alpine (with `uuid-ossp` and `pg_trgm` extensions enabled on boot)
  * **Object Storage:** MinIO (S3-compatible local storage with auto-provisioned public read bucket `aura-assets`)

---

## 2. Complete Monorepo Directory Structure

Every file and directory listed below must be created in its exact path:

```text
aura-tech-monorepo/
├── .env.example                                  # Master environment variable template (copy to .env)
├── docker-compose.yml                            # Orchestrates Postgres, MinIO, Go API, and React Web
├── Makefile                                      # Developer ergonomics commands (up, down, seed, logs, reset)
├── PROJECT_SPEC.md                               # This Master Specification file
│
├── infra/
│   └── postgres/
│       └── init.sql                              # Enables uuid-ossp and pg_trgm extensions
│
├── apps/
│   ├── api/                                      # ================= BACKEND (GO + GORM) =================
│   │   ├── Dockerfile.dev                        # Go development container with Air hot-reload
│   │   ├── .air.toml                             # Air configuration for live binary rebuilding
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── cmd/
│   │   │   ├── server/
│   │   │   │   └── main.go                       # API server entrypoint, DI wiring, graceful shutdown
│   │   │   └── seeder/
│   │   │       └── main.go                       # Idempotent rich database seeder (MacBooks, Laptops, Gadgets)
│   │   └── internal/
│   │       ├── config/
│   │       │   └── config.go                     # Loads env vars with fallback defaults
│   │       ├── database/
│   │       │   └── postgres.go                   # GORM connection, AutoMigrate, and raw GIN index creation
│   │       ├── storage/
│   │       │   └── minio.go                      # MinIO client & presigned upload URL generator
│   │       ├── models/
│   │       │   ├── user.go                       # User model
│   │       │   ├── banner.go                     # Dynamic Component-Driven Banner model
│   │       │   ├── catalog.go                    # Category, Brand, Product, ProductVariant, ProductAccessoryBundle
│   │       │   ├── interaction.go                # Wishlist, CartItem (supports UserID & GuestSessionID)
│   │       │   └── order.go                      # Order, OrderItem, StockReservation
│   │       ├── dto/
│   │       │   ├── envelope.go                   # Standard JSON response wrapper & pagination/facet meta
│   │       │   ├── catalog_dto.go                # Filter query params, product detail response, facet counts
│   │       │   ├── checkout_dto.go               # Checkout request, mock payment payload, S/N assignment
│   │       │   └── auth_dto.go                   # Login/Register requests & Guest Session merge payloads
│   │       ├── middleware/
│   │       │   ├── auth.go                       # JWT extraction + GuestSessionID resolver
│   │       │   └── cors.go                       # CORS configuration allowing Frontend container/localhost
│   │       ├── repository/
│   │       │   ├── banner_repo.go                # Active scheduled banners query
│   │       │   ├── catalog_repo.go               # Dynamic JSONB filtering, facet aggregation, pg_trgm search
│   │       │   ├── interaction_repo.go           # Wishlist, Cart CRUD, and Guest-to-User transactional merge
│   │       │   └── order_repo.go                 # Atomic stock soft-lock, order creation, S/N fulfillment
│   │       ├── service/
│   │       │   ├── auth_service.go               # Auth logic + triggers Guest-to-User merge on login/register
│   │       │   ├── catalog_service.go            # CTO configurator tree builder & comparison matrix builder
│   │       │   ├── checkout_service.go           # 15-min reservation TTL, mock payment webhook, 0% installment math
│   │       │   └── admin_service.go              # Analytics, low-stock alerts, SKU builder, S/N validation
│   │       └── handler/
│   │           ├── router.go                     # Registers all /api/v1 routes
│   │           ├── auth_handler.go
│   │           ├── storefront_handler.go         # Public banners, catalog, product detail, search, compare
│   │           ├── interaction_handler.go        # Wishlist & Cart endpoints
│   │           ├── checkout_handler.go           # Checkout, reservation status, mock payment simulator
│   │           └── admin_handler.go              # Backoffice CRUD & analytics endpoints
│   │
│   └── web/                                      # ================= FRONTEND (REACT + VITE) =================
│       ├── Dockerfile.dev                        # Node 22 Alpine container running Vite dev server
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx                          # App entry, QueryClientProvider, RouterProvider
│           ├── index.css                         # Tailwind CSS v4 imports & custom utility variables
│           ├── app/
│           │   ├── providers.tsx                 # Global providers + Guest Session initializer
│           │   └── lenis-manager.tsx             # Route-aware Lenis Smooth Scroll controller
│           ├── types/
│           │   └── api.ts                        # Shared TypeScript interfaces matching Go DTOs & JSONB schemas
│           ├── lib/
│           │   ├── api-client.ts                 # Fetch/Axios wrapper injecting Authorization & X-Guest-Session-ID
│           │   ├── currency.ts                   # Converts Satang (int64) <-> formatted THB (฿59,900)
│           │   └── utils.ts                      # cn() class merger and helper functions
│           ├── stores/
│           │   ├── use-auth-store.ts             # User profile, JWT token, and Guest Session ID persistence
│           │   ├── use-ui-store.ts               # Controls Cart Drawer, Command Palette (Cmd+K), Auth Modal
│           │   └── use-compare-store.ts          # Stores up to 3 Product slugs/summaries for side-by-side comparison
│           ├── components/
│           │   ├── layout/
│           │   │   ├── top-ribbon.tsx            # Dynamic TOP_RIBBON promotional bar
│           │   │   ├── navbar.tsx                # Glassmorphic sticky header with Cmd+K trigger, Wishlist, Cart badge
│           │   │   └── footer.tsx                # Comprehensive 5-column enterprise IT store footer + trust badges
│           │   └── ui/                           # Reusable primitives (Button, Dialog, Drawer, Skeleton, AnimatedPrice)
│           ├── features/
│           │   ├── banner/
│           │   │   ├── hero-split-banner.tsx     # Adaptive DARK/LIGHT flagship product showcase banner
│           │   │   └── bento-promo-grid.tsx      # Dynamic multi-span promotional Bento grid
│           │   ├── wishlist/
│           │   │   └── wishlist-heart-button.tsx # 4-State SVG + Motion heart button with 6-particle burst
│           │   ├── catalog/
│           │   │   ├── product-card.tsx          # Zero-CLS card, 150ms hover prefetch, subtle image zoom, compare button
│           │   │   ├── filter-sidebar.tsx        # Usage persona chips, non-linear price slider, JSONB spec facets
│           │   │   └── quick-price-chips.tsx     # Instant price bracket selector chips
│           │   ├── configurator/
│           │   │   ├── sticky-gallery.tsx        # Cross-fading product gallery synced with selected color variant
│           │   │   ├── cto-spec-selector.tsx     # Apple-style step selector (Color -> Chip -> RAM -> Storage) with +฿ deltas
│           │   │   ├── bento-highlights.tsx      # 6-card visual feature Bento grid
│           │   │   ├── ports-and-box.tsx         # Left/Right port callout diagram & "What's in the Box" visual showcase
│           │   │   ├── bought-together.tsx       # 1-click accessory bundle add-on widget
│           │   │   └── full-spec-matrix.tsx      # Categorized technical specifications table
│           │   ├── compare/
│           │   │   ├── compare-floating-tray.tsx # Bottom sticky bar showing up to 3 selected laptops
│           │   │   └── compare-modal.tsx         # Side-by-side spec comparison table with "Differences Only" toggle
│           │   ├── search/
│           │   │   └── command-palette.tsx       # Cmd+K / Ctrl+K instant search modal with live stock & price badges
│           │   ├── cart/
│           │   │   └── cart-drawer.tsx           # Spring-animated slide-over cart with installment preview
│           │   ├── checkout/
│           │   │   ├── reservation-timer.tsx     # 15:00 countdown timer synced with backend StockReservation
│           │   │   ├── promptpay-qr-simulator.tsx# Live QR display + Developer "Simulate Scan Success" webhook button
│           │   │   ├── interactive-card-form.tsx # Auto-brand detection, 3D CVV flip, and "0000" decline simulator
│           │   │   └── installment-calculator.tsx# 0% installment bank & tenure (3, 6, 10 months) selector
│           │   └── admin/
│           │       ├── analytics-cards.tsx       # Revenue, orders, and Low Stock Alert (< 3 units) table
│           │       ├── banner-manager.tsx        # Live preview editor for HERO_SPLIT and BENTO_GRID banners
│           │       ├── sku-matrix-builder.tsx    # Product & CTO Variant creator
│           │       └── order-sn-fulfillment.tsx  # Order state manager enforcing Serial Number (S/N) input before SHIPPED
│           └── routes/
│               ├── __root.tsx
│               ├── index.tsx                     # Storefront Landing Page
│               ├── catalog.index.tsx             # Full Faceted Catalog Page
│               ├── products.$slug.tsx            # Apple-Style Product Detail & CTO Configurator Page
│               ├── checkout.index.tsx            # Protected/Guest Checkout & Mock Payment Gateway Page
│               ├── orders.$orderNumber.tsx       # Order Confirmation & Receipt Page with S/N warranty display
│               └── admin/
│                   ├── route.tsx                 # Admin Layout (forces Lenis smooth scroll OFF)
│                   ├── index.tsx                 # Admin Overview & Low Stock Alerts
│                   ├── banners.tsx               # Banner Management
│                   ├── products.tsx              # Product & SKU Management
│                   └── orders.tsx                # Order & Serial Number Fulfillment
```

---

## 3. Infrastructure & Starter Configuration Files

Create these exact files first to establish the local Docker environment.

### 3.1 `.env.example` (Copy to `.env` at Monorepo Root)
```ini
# --- Project General ---
PROJECT_NAME=aura-tech

# --- PostgreSQL 16 Database ---
POSTGRES_USER=aura_admin
POSTGRES_PASSWORD=aura_secret_password
POSTGRES_DB=aura_ecommerce
POSTGRES_PORT=5432
DATABASE_URL=postgres://aura_admin:aura_secret_password@postgres:5432/aura_ecommerce?sslmode=disable

# --- MinIO (S3-Compatible Object Storage) ---
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadminpassword
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_BUCKET_NAME=aura-assets
MINIO_ENDPOINT=minio:9000
MINIO_PUBLIC_URL=http://localhost:9000/aura-assets

# --- Backend (Go API) ---
API_PORT=8080
JWT_SECRET=aura_tech_local_jwt_secret_key_2026
STOCK_LOCK_TTL_MINUTES=15

# --- Frontend (React + Vite) ---
WEB_PORT=5173
VITE_API_BASE_URL=http://localhost:8080/api/v1
VITE_STORAGE_URL=http://localhost:9000/aura-assets
```

### 3.2 `infra/postgres/init.sql`
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### 3.3 `docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: aura_postgres
    restart: unless-stopped
    env_file: .env
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: aura_minio
    restart: unless-stopped
    env_file: .env
    command: server /data --console-address ":9001"
    ports:
      - "${MINIO_API_PORT:-9000}:9000"
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    container_name: aura_minio_init
    depends_on:
      minio:
        condition: service_healthy
    env_file: .env
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $${MINIO_ROOT_USER} $${MINIO_ROOT_PASSWORD};
      mc mb --ignore-existing local/$${MINIO_BUCKET_NAME};
      mc anonymous set download local/$${MINIO_BUCKET_NAME};
      exit 0;
      "

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile.dev
    container_name: aura_api
    restart: unless-stopped
    env_file: .env
    ports:
      - "${API_PORT:-8080}:8080"
    volumes:
      - ./apps/api:/app
      - go_mod_cache:/go/pkg/mod
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    container_name: aura_web
    restart: unless-stopped
    env_file: .env
    ports:
      - "${WEB_PORT:-5173}:5173"
    volumes:
      - ./apps/web:/app
      - /app/node_modules
    depends_on:
      - api

volumes:
  postgres_data:
  minio_data:
  go_mod_cache:
```

### 3.4 `apps/api/Dockerfile.dev` & `apps/api/.air.toml`
**`apps/api/Dockerfile.dev`:**
```dockerfile
FROM golang:1.23-alpine
WORKDIR /app
RUN apk add --no-cache git curl
RUN go install github.com/air-verse/air@latest
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]
```

**`apps/api/.air.toml`:**
```toml
root = "."
tmp_dir = "tmp"

[build]
  cmd = "go build -o ./tmp/main ./cmd/server"
  bin = "./tmp/main"
  delay = 500
  exclude_dir = ["tmp", "vendor", "testdata"]
  include_ext = ["go", "tpl", "tmpl", "html"]
  kill_delay = "0s"
```

### 3.5 `apps/web/Dockerfile.dev`
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
```

### 3.6 `Makefile`
```makefile
.PHONY: up down logs seed psql reset

up:
	cp -n .env.example .env || true
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

seed:
	docker compose exec api go run cmd/seeder/main.go

psql:
	docker compose exec postgres psql -U aura_admin -d aura_ecommerce

reset:
	docker compose down -v
	cp -n .env.example .env || true
	docker compose up -d --build
```

---

## 4. Database Schema, GORM Models & JSONB Contracts

### 4.1 Non-Negotiable Database Rules
1. **Monetary Values in Satang (`int64`):** Every price, discount, and installment amount MUST be stored as an integer in **Satang** ($1\text{ THB} = 100\text{ Satang}$). Example: $\text{฿}59,900.00$ is stored as `5990000`. Never use `float` or `decimal` for currency.
2. **GIN Indexes on `JSONB`:** On startup (`database/postgres.go`), after `db.AutoMigrate(...)`, execute raw SQL to ensure GIN indexes exist:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_products_usage_personas ON products USING GIN (usage_personas);
   CREATE INDEX IF NOT EXISTS idx_product_variants_specs ON product_variants USING GIN (specs);
   CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
   ```

### 4.2 GORM Models (`apps/api/internal/models/`)

```go
package models

import (
	"time"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	FullName     string    `gorm:"not null" json:"full_name"`
	Phone        string    `json:"phone"`
	Role         string    `gorm:"type:varchar(20);default:'CUSTOMER'" json:"role"` // CUSTOMER, ADMIN
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Category struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Slug      string    `gorm:"uniqueIndex;not null" json:"slug"` // mac, ultrabooks, gaming-laptops, monitors, accessories
	Name      string    `gorm:"not null" json:"name"`
	IconName  string    `json:"icon_name"` // Lucide icon identifier
	SortOrder int       `gorm:"default:0" json:"sort_order"`
}

type Brand struct {
	ID      uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Slug    string    `gorm:"uniqueIndex;not null" json:"slug"` // apple, asus, lenovo, dell, msi, lg, keychron
	Name    string    `gorm:"not null" json:"name"`
	LogoURL string    `json:"logo_url"`
}

// Component-Driven Dynamic Banner (Replaces flat unreadable image banners)
type Banner struct {
	ID               uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Placement        string    `gorm:"index;not null" json:"placement"` // HERO_SPLIT (60%), BENTO_GRID (30%), TOP_RIBBON (10%)
	GridSpan         string    `gorm:"default:'col-span-1 row-span-1'" json:"grid_span"` // e.g., "col-span-2 row-span-2"
	ThemeMode        string    `gorm:"default:'DARK'" json:"theme_mode"` // DARK (white text), LIGHT (dark text)
	BackgroundColor  string    `gorm:"not null" json:"background_color"` // Hex or CSS radial/linear-gradient
	BadgeText        string    `json:"badge_text"`                       // e.g., "NEW RELEASE", "0% 10 MONTHS"
	Headline         string    `gorm:"not null" json:"headline"`         // e.g., "MacBook Pro 14 with M4 Pro"
	Subheadline      string    `json:"subheadline"`                      // e.g., "Mind-blowing performance. Up to 24 hrs battery."
	ProductImageURL  string    `gorm:"not null" json:"product_image_url"`// Transparent PNG/WebP product cutout
	CTAPrimaryText   string    `gorm:"default:'Shop Now'" json:"cta_primary_text"`
	CTAPrimaryLink   string    `gorm:"not null" json:"cta_primary_link"`
	CTASecondaryText string    `json:"cta_secondary_text"`
	CTASecondaryLink string    `json:"cta_secondary_link"`
	SortOrder        int       `gorm:"default:0" json:"sort_order"`
	IsActive         bool      `gorm:"default:true" json:"is_active"`
	StartAt          time.Time `gorm:"index" json:"start_at"`
	EndAt            time.Time `gorm:"index" json:"end_at"`
	CreatedAt        time.Time `json:"created_at"`
}

type Product struct {
	ID               uuid.UUID        `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Slug             string           `gorm:"uniqueIndex;not null" json:"slug"`
	Name             string           `gorm:"index;not null" json:"name"`
	CategoryID       uuid.UUID        `gorm:"type:uuid;index;not null" json:"category_id"`
	Category         Category         `gorm:"foreignKey:CategoryID" json:"category"`
	BrandID          uuid.UUID        `gorm:"type:uuid;index;not null" json:"brand_id"`
	Brand            Brand            `gorm:"foreignKey:BrandID" json:"brand"`
	Tagline          string           `json:"tagline"`
	ShortDescription string           `json:"short_description"`
	BasePrice        int64            `gorm:"not null;index" json:"base_price"` // Lowest variant price in Satang
	UsagePersonas    datatypes.JSON   `gorm:"type:jsonb" json:"usage_personas"` // ["CREATOR", "GAMING", "ULTRALIGHT", "OFFICE"]
	BentoHighlights  datatypes.JSON   `gorm:"type:jsonb" json:"bento_highlights"`
	BoxContents      datatypes.JSON   `gorm:"type:jsonb" json:"box_contents"`
	PortsDiagram     datatypes.JSON   `gorm:"type:jsonb" json:"ports_diagram"`
	FullSpecMatrix   datatypes.JSON   `gorm:"type:jsonb" json:"full_spec_matrix"`
	IsActive         bool             `gorm:"default:true" json:"is_active"`
	Variants         []ProductVariant `gorm:"foreignKey:ProductID" json:"variants"`
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
}

type ProductVariant struct {
	ID            uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ProductID     uuid.UUID      `gorm:"type:uuid;index;not null" json:"product_id"`
	SKU           string         `gorm:"uniqueIndex;not null" json:"sku"` // e.g., "MBP14-M4P-24-512-SB"
	ColorName     string         `gorm:"not null" json:"color_name"`       // e.g., "Space Black"
	ColorHex      string         `gorm:"not null" json:"color_hex"`        // e.g., "#2E2C2E"
	Price         int64          `gorm:"not null;index" json:"price"`      // Exact price in Satang
	ComparePrice  int64          `json:"compare_price"`                    // Strikethrough price in Satang (optional)
	StockQuantity int            `gorm:"not null;default:0" json:"stock_quantity"`
	ReservedStock int            `gorm:"not null;default:0" json:"reserved_stock"` // Soft-locked during 15m checkout
	Specs         datatypes.JSON `gorm:"type:jsonb" json:"specs"`
	Images        datatypes.JSON `gorm:"type:jsonb" json:"images"` // ["url_front", "url_side", "url_open"]
}

// Frequently Bought Together mapping
type ProductAccessoryBundle struct {
	ID                 uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	MainProductID      uuid.UUID `gorm:"type:uuid;index;not null" json:"main_product_id"`
	AccessoryProductID uuid.UUID `gorm:"type:uuid;not null" json:"accessory_product_id"`
	AccessoryProduct   Product   `gorm:"foreignKey:AccessoryProductID" json:"accessory_product"`
	BundleDiscountPct  int       `gorm:"default:10" json:"bundle_discount_pct"` // e.g., 10% off accessory when bought together
}

type Wishlist struct {
	ID             uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID         *uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	GuestSessionID *string    `gorm:"type:varchar(64);index" json:"guest_session_id"`
	ProductID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"product_id"`
	Product        Product    `gorm:"foreignKey:ProductID" json:"product"`
	CreatedAt      time.Time  `json:"created_at"`
}

type CartItem struct {
	ID             uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID         *uuid.UUID     `gorm:"type:uuid;index" json:"user_id"`
	GuestSessionID *string        `gorm:"type:varchar(64);index" json:"guest_session_id"`
	VariantID      uuid.UUID      `gorm:"type:uuid;not null" json:"variant_id"`
	Variant        ProductVariant `gorm:"foreignKey:VariantID" json:"variant"`
	Quantity       int            `gorm:"not null;default:1" json:"quantity"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type StockReservation struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderID   uuid.UUID `gorm:"type:uuid;index;not null" json:"order_id"`
	VariantID uuid.UUID `gorm:"type:uuid;index;not null" json:"variant_id"`
	Quantity  int       `gorm:"not null" json:"quantity"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expires_at"` // CreatedAt + 15 minutes
	Status    string    `gorm:"default:'ACTIVE'" json:"status"`   // ACTIVE, COMMITTED, RELEASED
}

type Order struct {
	ID              uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderNumber     string         `gorm:"uniqueIndex;not null" json:"order_number"` // Format: AURA-YYYYMMDD-XXXX
	UserID          *uuid.UUID     `gorm:"type:uuid;index" json:"user_id"`
	GuestSessionID  *string        `gorm:"type:varchar(64);index" json:"guest_session_id"`
	CustomerEmail   string         `gorm:"not null" json:"customer_email"`
	Status          string         `gorm:"index;not null" json:"status"` // PENDING_PAYMENT, PAID_PROCESSING, SN_ASSIGNED, SHIPPED, DELIVERED, CANCELLED
	SubtotalAmount  int64          `gorm:"not null" json:"subtotal_amount"`
	DiscountAmount  int64          `gorm:"default:0" json:"discount_amount"`
	GrandTotal      int64          `gorm:"not null" json:"grand_total"`
	ShippingAddress datatypes.JSON `gorm:"type:jsonb;not null" json:"shipping_address"`
	PaymentMethod   string         `gorm:"not null" json:"payment_method"` // PROMPTPAY_QR, CREDIT_CARD, INSTALLMENT_0
	InstallmentPlan datatypes.JSON `gorm:"type:jsonb" json:"installment_plan"`
	ReservationExpiresAt time.Time `json:"reservation_expires_at"`
	Items           []OrderItem    `gorm:"foreignKey:OrderID" json:"items"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

type OrderItem struct {
	ID           uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderID      uuid.UUID `gorm:"type:uuid;index;not null" json:"order_id"`
	VariantID    uuid.UUID `gorm:"type:uuid;not null" json:"variant_id"`
	SKUSnapshot  string    `gorm:"not null" json:"sku_snapshot"`
	NameSnapshot string    `gorm:"not null" json:"name_snapshot"`
	SpecSummary  string    `json:"spec_summary"` // e.g., "Space Black / M4 Pro / 24GB / 512GB"
	UnitPrice    int64     `gorm:"not null" json:"unit_price"`
	Quantity     int       `gorm:"not null" json:"quantity"`
	SerialNumber string    `gorm:"index" json:"serial_number"` // Mandatory before status can transition to SHIPPED
}

// 4.3 Exact JSONB TypeScript & Go Data Contracts (apps/web/src/types/api.ts)
// Both Backend Seeder/DTOs and Frontend Components MUST adhere to these exact JSON structures:

// 1. ProductVariant.Specs JSONB Schema
export interface VariantSpecs {
  cpu_family: string;       // e.g., "Apple M4 Pro", "Apple M3", "Intel Core Ultra 7", "AMD Ryzen AI 9"
  cpu_detail: string;       // e.g., "12-core CPU / 16-core GPU"
  ram_gb: number;           // e.g., 16, 24, 32, 64
  storage_gb: number;       // e.g., 256, 512, 1024, 2048
  screen_size_inch: number; // e.g., 13.6, 14.2, 16.0, 27.0
  panel_type: string;       // e.g., "Liquid Retina XDR", "OLED", "Nano IPS"
  refresh_rate_hz: number;  // e.g., 60, 120, 240
  weight_kg: number;        // e.g., 1.24, 1.55, 1.85
  has_thunderbolt: boolean;
}

// 2. Product.BentoHighlights JSONB Schema (6 cards per flagship product)
export interface BentoHighlightItem {
  id: string;
  span: "col-span-1" | "col-span-2";
  icon: string;             // Lucide icon name: "BatteryCharging", "Cpu", "Sparkles", "Monitor", "Feather", "Wifi"
  eyebrow: string;          // e.g., "BATTERY LIFE"
  big_metric: string;       // e.g., "Up to 24 hrs"
  title: string;            // e.g., "Longest battery life ever in a Mac"
  description: string;      // e.g., "Go all day and night on a single charge with Apple silicon efficiency."
}

// 3. Product.PortsDiagram JSONB Schema
export interface PortsDiagramData {
  left_ports: Array<{ name: string; spec: string }>;  // e.g., [{ name: "MagSafe 3", spec: "Fast-charge up to 140W" }, { name: "2x Thunderbolt 5 (USB-C)", spec: "Up to 120Gb/s, DisplayPort" }, { name: "3.5mm Headphone Jack", spec: "High-impedance support" }]
  right_ports: Array<{ name: string; spec: string }>; // e.g., [{ name: "HDMI 2.1", spec: "Supports up to 8K@60Hz or 4K@240Hz" }, { name: "1x Thunderbolt 5 (USB-C)", spec: "Up to 120Gb/s" }, { name: "SDXC Card Slot", spec: "UHS-II support" }]
}

// 4. Product.BoxContents JSONB Schema
export interface BoxContentItem {
  name: string;             // e.g., "14-inch MacBook Pro", "USB-C to MagSafe 3 Cable (2 m)", "70W USB-C Power Adapter"
  icon: string;             // "Laptop", "Cable", "Plug"
}

// 5. Product.FullSpecMatrix JSONB Schema (Used in Product Page & Side-by-Side Comparison)
export interface SpecCategoryGroup {
  category: string;         // "Processor & Memory", "Display", "Storage", "Connectivity & Ports", "Audio & Camera", "Battery & Power", "Dimensions & Weight"
  rows: Array<{ label: string; value: string }>;
}

// 6. Order.InstallmentPlan JSONB Schema
export interface InstallmentPlanData {
  bank_code: "KBANK" | "SCB" | "KRUNGSRI" | "BBL";
  bank_name: string;
  months: 3 | 6 | 10;
  interest_rate: 0;
  monthly_pay_satang: number;
}

---

## 5. REST API Contract & Endpoint Specification

### 5.1 Standard Response Envelope
Every API endpoint under `/api/v1` MUST return this JSON envelope:
```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "limit": 12,
    "total_items": 24,
    "facets": {}
  },
  "error": null
}
```
If an error occurs, return the appropriate HTTP status code with:
```json
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "The last unit of this configuration is currently reserved by another customer."
  }
}
```

### 5.2 Complete Route Table (`/api/v1`)

| Method | Path | Description & Key Implementation Logic |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | Creates user, issues JWT, and runs **Guest-to-User Merge** in a DB transaction using `X-Guest-Session-ID`. |
| `POST` | `/auth/login` | Validates credentials, issues JWT, and runs **Guest-to-User Merge** for Wishlist & Cart items. |
| `GET` | `/auth/me` | Returns authenticated user profile. |
| `GET` | `/banners` | Returns active banners where `is_active = true AND NOW() BETWEEN start_at AND end_at`, grouped by `HERO_SPLIT`, `BENTO_GRID`, and `TOP_RIBBON`. |
| `GET` | `/catalog` | Supports query params: `category`, `brand`, `persona`, `cpu`, `ram`, `storage`, `min_price`, `max_price`, `sort` (`price_asc`, `price_desc`, `newest`). Also returns dynamic **Facet Counts** (`meta.facets`) so the UI can show `(count)` and disable zero-result filters. |
| `GET` | `/products/:slug` | Returns full `Product`, all `Variants`, `BentoHighlights`, `PortsDiagram`, `BoxContents`, `FullSpecMatrix`, and `AccessoryBundles`. |
| `GET` | `/products/compare` | Query param `?slugs=slug1,slug2,slug3`. Returns up to 3 products with normalized `FullSpecMatrix` and variant specs for side-by-side comparison. |
| `GET` | `/search` | Query param `?q=...`. Uses `pg_trgm` (`ILIKE` + similarity on `name`, `tagline`, `sku`, and `specs::text`) to return top 8 instant matches in $< 50\text{ms}$ for the `Cmd+K` palette. |
| `GET` | `/wishlist` | Returns wishlist product IDs and product summaries for current `UserID` or `GuestSessionID`. |
| `POST` | `/wishlist/toggle` | Body: `{"product_id": "uuid"}`. Toggles like/unlike state and returns `{"liked": true/false, "total_count": N}`. |
| `GET` | `/cart` | Returns cart items with populated `Variant` + `Product` info, subtotal, and available stock status. |
| `POST` | `/cart/items` | Body: `{"variant_id": "uuid", "quantity": 1, "bundle_accessory_variant_ids": []}`. Adds item(s) or increments quantity. |
| `PATCH` | `/cart/items/:id` | Body: `{"quantity": N}`. Updates quantity (validating against available stock `stock_quantity - reserved_stock`). |
| `DELETE` | `/cart/items/:id` | Removes item from cart. |
| `POST` | `/checkout/reserve` | **Atomic Soft-Lock Transaction:** Verifies `(stock_quantity - reserved_stock) >= qty` for all cart items, increments `reserved_stock`, creates `Order` (`PENDING_PAYMENT`) + `StockReservation` with `ExpiresAt = NOW() + 15m`. |
| `POST` | `/checkout/pay` | **Mock Payment Gateway Processor:** Handles `PROMPTPAY_QR` (commits reservation, deducts `stock_quantity`, sets status `PAID_PROCESSING`), `CREDIT_CARD` (if card ends in `0000`, returns error `CARD_DECLINED_INSUFFICIENT_FUNDS` without releasing lock so user can retry), and `INSTALLMENT_0`. |
| `GET` | `/orders/:orderNumber` | Returns order details, payment receipt, reservation countdown, and assigned `SerialNumber`s. |
| `GET` | `/admin/overview` | Returns total revenue, order counts by status, and **Low Stock Alerts** (variants where `stock_quantity - reserved_stock <= 3`). |
| `POST` | `/admin/banners` | Creates or updates a component-driven banner. |
| `POST` | `/admin/products` | Creates product and its SKU variants. |
| `PATCH` | `/admin/orders/:id/status` | **Order State Machine:** If transitioning to `SHIPPED`, validates that every `OrderItem` has a non-empty `serial_number`. Rejects with `400 SERIAL_NUMBER_REQUIRED` if any S/N is missing. |

---

## 6. Deep-Dive Feature, UX/UI & Motion Specifications

### 6.1 Guest-to-User Session Merging (`internal/service/auth_service.go`)
1. On initial load of the React app, if `localStorage.getItem('aura_guest_session_id')` does not exist, generate a UUIDv4 (`guest_...`) and send it in every API request via the `X-Guest-Session-ID` header.
2. When a Guest clicks "Like" or "Add to Cart", records are stored with `guest_session_id`.
3. Immediately upon `/auth/login` or `/auth/register`, the backend executes a DB transaction:
   * Moves all `Wishlist` rows matching `guest_session_id` to `user_id` (ignoring duplicates where the user already liked the same `product_id`).
   * Moves all `CartItem` rows matching `guest_session_id` to `user_id` (if the user already has the same `variant_id` in their user cart, sum the quantities).

### 6.2 Dynamic Component-Driven Banner System
* **Why:** Traditional flat image banners become illegible on mobile screens and cannot adapt buttons/text dynamically.
* **Three Placement Types & Campaign Probabilities:**
  1. **`HERO_SPLIT` (60% probability — Flagship Product Launch):**
     * **Left Column:** Animated pill badge (`NEW RELEASE`), high-contrast typography headline, starting price + 0% installment callout (`From ฿59,900 or ฿5,990/mo. for 10 mos.`), Primary CTA button, and Secondary "Compare Specs" button.
     * **Right Column:** Floating high-res product image with subtle continuous levitation animation (`y: [0, -8, 0]`, `duration: 5s`, `repeat: Infinity`).
     * **Theme Adaptation:** When `theme_mode === 'DARK'` (e.g., Space Black MacBook Pro), background uses `#090A0F` with `#F4F4F5` text. When `theme_mode === 'LIGHT'` (e.g., Silver MacBook Air), background uses `#F5F5F7` with `#18181B` text.
  2. **`BENTO_GRID` (30% probability — Multi-Category Campaigns):**
     * 4-column responsive CSS grid where each card uses `grid_span` (`col-span-2 row-span-2`, `col-span-1 row-span-1`, etc.) to highlight Student Education Discounts, Gaming Notebooks, and Thunderbolt Accessories.
  3. **`TOP_RIBBON` (10% probability — Storewide Announcement Bar):**
     * Sleek top bar above the Navbar announcing storewide perks (e.g., *"0% Installment up to 10 Months + Free 3-Hour Express Delivery in Bangkok"*).

### 6.3 Non-Linear Price Range & Faceted Catalog Filter
* **Non-Linear Price Slider + Quick Price Chips:**
  * IT products span from ฿590 cables to ฿159,900 laptops. Provide interactive **Quick Price Bracket Chips**:
    * `All Prices`
    * `Under ฿15,000` (Accessories & Entry Gear)
    * `฿15,000 – ฿35,000` (Everyday & Student Laptops)
    * `฿35,000 – ฿65,000` (Ultrabooks & MacBook Air)
    * `Above ฿65,000` (MacBook Pro & Flagship Workstations)
  * Alongside the chips, provide dual Min/Max numeric inputs and a range slider operating in THB (converted to Satang on URL query params).
* **Faceted Filter Groups (with live item counts in parentheses):**
  * **Usage Persona:** `CREATOR` (Video & 3D Editing), `GAMING` (High-FPS Gaming), `ULTRALIGHT` (Featherweight < 1.3 kg), `OFFICE` (Study & Productivity)
  * **Brand:** Apple, ASUS, Lenovo, LG, Keychron
  * **Processor Family:** Apple M4 Pro / Max, Apple M3, Intel Core Ultra, AMD Ryzen AI
  * **Memory (RAM):** `16GB`, `24GB`, `32GB`, `64GB`
  * **Storage (SSD):** `256GB`, `512GB`, `1TB`, `2TB`
* **Zero-Result Prevention:** Any filter checkbox whose facet count in the current filter context is `0` must be rendered with `disabled={true}` and `opacity-40 cursor-not-allowed`.

### 6.4 Apple-Style Product Detail & Interactive CTO Configurator (`/products/$slug`)
This page must feel rich, authoritative, and meticulously engineered:
1. **Two-Column Top Configurator Section:**
   * **Left (`<StickyGallery />`):** `sticky top-24`. Displays the product image gallery for the currently selected `ColorName`. Switching colors triggers an instant `AnimatePresence` cross-fade (`duration: 0.25s`).
   * **Right (`<CTOSpecSelector />`):**
     * **Step 1: Choose Finish (Color):** Circular color swatches (`ColorHex`) with active ring indicator.
     * **Step 2: Choose Chip (CPU/GPU):** Boxed selector cards.
     * **Step 3: Choose Unified Memory (RAM):** Boxed selector cards showing exact **Price Delta** relative to the current selection (e.g., `+ ฿7,000` or `- ฿7,000`). Includes an interactive *"How much memory do I need?"* popover guide.
     * **Step 4: Choose Storage (SSD):** Boxed selector cards with live price deltas.
     * **Sticky Summary Footer Card:** Shows dynamically resolved `SKU`, real-time stock badge (`In Stock — Ready to ship` or `Only 2 left`), animated total price (`<AnimatedPrice />`), calculated 0% monthly installment (`฿X,XXX/mo. for 10 mos.`), and Primary "Add to Bag" button.
2. **Frequently Bought Together (`<BoughtTogether />`):**
   * Displays curated compatible accessories from `ProductAccessoryBundle` with a 10% bundle discount badge and a 1-click "Add Selected to Bag" button.
3. **6-Card Bento Grid Highlights (`<BentoHighlights />`):**
   * Apple keynote-style Bento grid rendering `bento_highlights` with large typographic metrics (`Up to 24 hrs`, `120Hz ProMotion`, `Thunderbolt 5`).
4. **Ports Callout Diagram & What's in the Box (`<PortsAndBox />`):**
   * Visual diagram illustrating left-side and right-side chassis ports (`ports_diagram`) and a clean horizontal showcase of included items (`box_contents`).
5. **Full Technical Specification Matrix (`<FullSpecMatrix />`):**
   * Categorized spec table with clean alternating rows.

### 6.5 Smooth Scroll (`Lenis`) & Purposeful Motion Rules
1. **Strict Route-Scoped Smooth Scroll (`apps/web/src/app/lenis-manager.tsx`):**
   * **ENABLED:** Storefront Landing Page (`/`) and Product Detail Page (`/products/$slug`).
   * **STRICTLY DISABLED (Destroy/Pause Lenis instance):** All `/admin/*` routes, `/checkout`, and whenever any Modal, Drawer (`CartDrawer`, `CompareModal`, `CommandPalette`) is open. This prevents scroll hijacking inside data tables and scrollable drawers.
2. **Motion Do's and Don'ts:**
   * **Product Card Hover:** Transition border color (`border-zinc-200` -> `border-zinc-400`), scale **only** the inner product image (`scale: 1.03`, `transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] }`), and trigger `queryClient.prefetchQuery` for that product's slug if hovered for > 150ms. **NEVER** scale the entire card container or hide the price/buy buttons behind hover states.
   * **Spec Selector Highlight:** Use Motion's `layoutId` for active selection rings/pills so the border glides smoothly when switching RAM or Storage options.

### 6.6 The 4-State `<WishlistHeartButton />` Specification
Located at `apps/web/src/features/wishlist/wishlist-heart-button.tsx`. Must implement these exact 4 visual and physics states:
1. **State 1 — Idle (Unliked):**
   * Circular glassmorphic button (`w-9 h-9 rounded-full backdrop-blur-md bg-white/80 border border-zinc-200/80 shadow-xs flex items-center justify-center`).
   * Heart SVG has `stroke="#52525B"`, `strokeWidth={1.8}`, `fill="transparent"`.
2. **State 2 — Hover (Anticipation):**
   * Button container scales slightly (`scale: 1.08`).
   * Heart stroke transitions to Rose Red (`#F43F5E`) and performs a single subtle heartbeat pulse (`scale: [1, 1.18, 1]`, `transition: { duration: 0.28 }`).
3. **State 3 — Active / Click to Like (Tactile Pop + 6-Particle Burst):**
   * `whileTap={{ scale: 0.82 }}` (physical press-down compression).
   * On release into `liked = true`:
     * Heart fills solid Rose Red (`fill="#F43F5E"`, `stroke="#F43F5E"`) and springs outward (`scale: [0.82, 1.32, 1]`, `transition: { type: "spring", stiffness: 500, damping: 15 }`).
     * **SVG Micro-Particle Burst:** Render 6 small circles (`r="2"`) positioned radially at 0°, 60°, 120°, 180°, 240°, 300°. Animate each particle outward from distance 0px to 14px using (cosθ * 14, sinθ * 14) while fading `opacity: [1, 0]` and `scale: [1, 0]` over 350ms.
4. **State 4 — Click to Unlike (Calm Release):**
   * No particle burst. Heart gently contracts (`scale: [1, 0.86, 1]`, `duration: 0.2s`) and fades fill back to `transparent` with `#52525B` stroke.

### 6.7 Comprehensive 5-Column Enterprise Footer (`apps/web/src/components/layout/footer.tsx`)
Must look like a top-tier authorized IT retailer:
* **Top Value Proposition Strip:** 4 icons with guarantees: *100% Authorized Genuine Warranty*, *Free 3-Hour Express Delivery*, *0% Installment up to 10 Months*, *7-Day Dead-Pixel / DOA Replacement*.
* **Column 1 (Brand & Contact):** AURA TECH logo, tagline, Call Center `02-118-9999` (Daily 09:00 - 21:00), Support email `support@auratech.co.th`, Line Official ID `@auratech`.
* **Column 2 (Shop Categories):** MacBook & Apple, Ultrabooks, Gaming Notebooks, Pro Creator Monitors, Mechanical Keyboards & Mice, Thunderbolt Hubs & GaN Chargers.
* **Column 3 (Customer Services):** 0% Installment Guide, Student & University Pricing (U-Store), Trade-In Calculator, Corporate B2B Quotations, Same-Day Express Delivery.
* **Column 4 (Warranty & Support):** Track Order Status, Serial Number (S/N) Warranty Lookup, 7-Day Replacement Policy, Authorized Service Centers, FAQ.
* **Column 5 (Security & Payment Partners):** DBD Registered badge, 256-bit SSL Encryption badge, payment badges (Thai QR PromptPay, Visa, Mastercard, JCB, KBank, SCB, Krungsri), and logistics partners (DHL Express, Kerry Express, Flash).

---

## 7. Deterministic Rich Seed Data Specification (`apps/api/cmd/seeder/main.go`)

The seeder MUST be idempotent (safe to run multiple times via `make seed`) and must populate the database automatically on first server boot if the `products` table is empty. Seed the following exact dataset:

1. **Users:**
   * **Admin Account:** `admin@auratech.co.th` / Password: `password123` (`Role: ADMIN`)
   * **Demo Customer:** `demo@auratech.co.th` / Password: `password123` (`Role: CUSTOMER`)
2. **Banners (4 Active Banners):**
   * `TOP_RIBBON`: *"⚡ FLASH TECH FEST: 0% Installment up to 10 Months + Free 3-Hour Express Delivery on all MacBook M4 models"*
   * `HERO_SPLIT` (Dark Mode): **MacBook Pro 14" M4 Pro** (`#090A0F` bg, badge `"NEW M4 PRO CHIP"`, link `/products/macbook-pro-14-m4`)
   * `BENTO_GRID` Card 1 (`col-span-2 row-span-2`): **ROG Zephyrus G16 OLED** — *"240Hz OLED Gaming & Creator Powerhouse"*
   * `BENTO_GRID` Card 2 (`col-span-2 row-span-1`): **Back to University Education Pricing** — *"Save up to ฿5,500 on MacBook Air M3"*
3. **Products & Multi-SKU CTO Variants (6 Complete Products with full JSONB metadata):**
   * **Product 1: `macbook-pro-14-m4` (MacBook Pro 14-inch M4 / M4 Pro)**
     * Colors: `Space Black` (`#2E2C2E`), `Silver` (`#E3E4E5`)
     * 4 Variants:
       1. `MBP14-M4-16-512-SB`: Space Black / Apple M4 (10C/10G) / 16GB RAM / 512GB SSD — `5990000` (฿59,900), Stock: `8`
       2. `MBP14-M4-16-512-SL`: Silver / Apple M4 (10C/10G) / 16GB RAM / 512GB SSD — `5990000` (฿59,900), Stock: `5`
       3. `MBP14-M4P-24-512-SB`: Space Black / Apple M4 Pro (12C/16G) / 24GB RAM / 512GB SSD — `7390000` (฿73,900), Stock: `4`
       4. `MBP14-M4P-48-1TB-SB`: Space Black / Apple M4 Pro (14C/20G) / 48GB RAM / 1TB SSD — `9490000` (฿94,900), Stock: `1` *(Used to test Low Stock Alert & Concurrency Soft-Lock!)*
   * **Product 2: `macbook-air-13-m3` (MacBook Air 13-inch M3)**
     * Colors: `Midnight` (`#2E3642`), `Starlight` (`#F0E4D3`), `Silver` (`#E3E4E5`)
     * 3 Variants: 16GB/256GB (`3990000` / ฿39,900), 16GB/512GB (`4690000` / ฿46,900), 24GB/512GB (`5390000` / ฿53,900)
   * **Product 3: `asus-rog-zephyrus-g16-oled` (ASUS ROG Zephyrus G16 GU605 OLED)**
     * Colors: `Eclipse Gray` (`#3A3B3C`), `Platinum White` (`#F2F3F4`)
     * 2 Variants: Intel Core Ultra 9 / RTX 4070 / 32GB / 1TB (`8999000` / ฿89,990), RTX 4080 / 32GB / 2TB (`11499000` / ฿114,990)
   * **Product 4: `lenovo-yoga-slim-7i-aura` (Lenovo Yoga Slim 7i Aura Edition 15")**
     * Color: `Luna Grey` (`#6D7175`)
     * 2 Variants: Intel Core Ultra 7 (Series 2) / 16GB / 512GB (`4299000` / ฿42,990), 32GB / 1TB (`4999000` / ฿49,990)
   * **Product 5: `lg-ultrafine-27-5k` (LG UltraFine 27" 4K/5K USB-C Pro Monitor)**
     * Variant: Matte Black / 27-inch IPS Black / Thunderbolt 96W PD (`2490000` / ฿24,900)
   * **Product 6: `keychron-q1-pro-wireless` (Keychron Q1 Pro QMK/VIA Wireless Custom Mechanical Keyboard)**
     * Variants: Carbon Black (`729000` / ฿7,290), Shell White (`729000` / ฿7,290) *(Linked as a Frequently Bought Together accessory for MacBook Pro & MacBook Air)*

---

## 8. Step-by-Step Autonomous Implementation Plan

When executing this specification, build the project in the following 5 sequential phases:

### Phase 1: Infrastructure & Monorepo Scaffolding
1. Create `.env.example`, `.env`, `docker-compose.yml`, `Makefile`, and `infra/postgres/init.sql`.
2. Create `apps/api/Dockerfile.dev`, `apps/api/.air.toml`, and `apps/web/Dockerfile.dev`.

### Phase 2: Backend Core, GORM Models & Rich Seeder (`apps/api`)
1. Initialize `go.mod` (`module aura-tech/api`) with Chi, GORM, Postgres driver, datatypes, uuid, jwt, and minio-go.
2. Implement `internal/config`, `internal/database` (with AutoMigrate and raw GIN indexes), and `internal/models` (all 11 models).
3. Implement `cmd/seeder/main.go` and invoke the seeder automatically in `cmd/server/main.go` if the database is empty so `docker compose up` results in a 100% populated store out-of-the-box.
4. Implement Repositories, Services, and HTTP Handlers for Auth (with Guest-to-User merge), Banners, Catalog Facets, Product Detail, Compare, `Cmd+K` Search, Wishlist, Cart, Atomic Checkout Soft-Lock, Mock Payment Gateway, and Admin Backoffice.

### Phase 3: Frontend Foundation, State & Navigation (`apps/web`)
1. Initialize React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Motion + Lenis + Zustand + TanStack Query.
2. Implement `api-client.ts` (injecting JWT and `X-Guest-Session-ID`), `currency.ts` (Satang formatter), and Zustand stores (`useAuthStore`, `useUIStore`, `useCompareStore`).
3. Implement `LenisManager` (enabling smooth scroll ONLY on `/` and `/products/$slug`), `<TopRibbon />`, `<Navbar />`, `<CommandPalette />` (`Cmd+K`), `<CartDrawer />`, `<CompareFloatingTray />`, `<CompareModal />`, and the 5-column `<Footer />`.

### Phase 4: Storefront, Catalog & Apple CTO Configurator (`apps/web`)
1. Build `<WishlistHeartButton />` with all 4 states and the 6-particle radial SVG burst.
2. Build `<ProductCard />` with zero-CLS aspect ratio, subtle inner image hover zoom, 150ms query prefetching, and Compare toggle.
3. Build the Landing Page (`/`) with `<HeroSplitBanner />`, `<BentoPromoGrid />`, Persona Quick-Links, and Featured Flagships.
4. Build the Catalog Page (`/catalog`) with `<QuickPriceChips />`, non-linear price filters, JSONB facet checkboxes with live `(count)` and zero-result disabling, and animated product grid transitions.
5. Build the Apple-Style Product Detail Page (`/products/$slug`) with `<StickyGallery />`, `<CTOSpecSelector />` (live `+฿` price deltas and animated price counter), `<BoughtTogether />`, `<BentoHighlights />`, `<PortsAndBox />`, and `<FullSpecMatrix />`.

### Phase 5: Mock Payment Gateway & Admin Backoffice (`apps/web`)
1. Build the Checkout Page (`/checkout`) featuring the 15:00 `<ReservationTimer />` and 3 payment tabs:
   * **Thai QR PromptPay:** Dynamic QR code + Developer Simulator Bar (*"Simulate Customer QR Scan Success"*).
   * **Credit / Debit Card:** Interactive card preview with auto Visa/Mastercard detection, 3D flip on CVV focus, and decline simulation when card number ends with `0000`.
   * **0% Installment Plan:** Bank selector (`KBANK`, `SCB`, `KRUNGSRI`, `BBL`) and tenure selector (`3`, `6`, `10` months) with exact monthly breakdown.
2. Build the Admin Backoffice (`/admin/*`) with Revenue/Order metrics, Low Stock Alert table (<= 3 units), Component Banner Builder, SKU Creator, and Order Fulfillment enforcing mandatory `Serial Number (S/N)` assignment before shipping.

---

## 9. Verification & Acceptance Test Suite (`TC-01` to `TC-10`)

Every test case below must pass to consider the build complete:

| ID | Feature Area | Test Scenario & Execution Steps | Expected Verification Result |
| :--- | :--- | :--- | :--- |
| **TC-01** | **Guest-to-User Merge** | As an unauthenticated guest, click the Heart button on 2 laptops and add 1 MacBook to the Cart. Then log in as `demo@auratech.co.th`. | Both liked products and the cart item are transactionally merged into `demo@auratech.co.th`'s account without data loss or duplicates. |
| **TC-02** | **Component Banner** | Load `/` and inspect the `HERO_SPLIT` and `BENTO_GRID` banners; create a new `LIGHT` mode banner in `/admin/banners`. | Banners render with crisp native HTML typography, adaptive Dark/Light contrast, floating PNG cutout, and working CTA links. |
| **TC-03** | **JSONB Faceted Filter** | On `/catalog`, select `RAM: 24GB` and click the `Above ฿65,000` price chip. | Product grid animates smoothly to show matching laptops, URL search params update, and incompatible facet options with `0` matches become disabled. |
| **TC-04** | **Apple CTO Configurator** | On `/products/macbook-pro-14-m4`, switch color from `Space Black` to `Silver`, then upgrade chip/RAM from `16GB` to `24GB` (`+ ฿14,000`). | Left sticky gallery cross-fades to the Silver MacBook, selection border glides via Motion, total price animates to `฿73,900`, and SKU updates to `MBP14-M4P-24-512-SB`. |
| **TC-05** | **Side-by-Side Compare** | Add 3 laptops to the comparison tray, open the Compare Modal, and toggle *"Highlight Differences Only"*. | Identical spec rows are hidden or muted, while differing rows (CPU, RAM, Weight, Ports) are visually highlighted side-by-side. |
| **TC-06** | **4-State Heart Button** | Hover over `<WishlistHeartButton />`, click to Like, then click again to Unlike. | Hover triggers 1 heartbeat pulse; Click compresses (`0.82`) then springs out (`1.32 -> 1.0`) with a 6-particle radial SVG burst; Unlike calmly fades out without particles. |
| **TC-07** | **Atomic Soft-Lock** | Select `MBP14-M4P-48-1TB-SB` (which has `StockQuantity: 1`) and proceed to `/checkout` (locking `ReservedStock: 1`). Attempt to checkout the same SKU from an incognito window. | User A receives a 15:00 reservation lock; User B immediately receives `409 INSUFFICIENT_STOCK` (*"Reserved by another customer"*). |
| **TC-08** | **Mock Payment Gateway** | Test paying with a Credit Card ending in `0000`, then switch to Thai QR PromptPay and click *"Simulate Scan Success"*. | Card ending in `0000` displays an inline bank decline alert while keeping the reservation alive; QR Simulator commits the stock deduction and redirects to the Order Receipt page. |
| **TC-09** | **Admin S/N Enforcement** | In `/admin/orders`, locate a `PAID_PROCESSING` order and attempt to change status to `SHIPPED` with an empty `Serial Number` field. | API and UI block the transition with a validation error until a valid Serial Number (e.g., `C02M4PRO9981`) is entered for every item. |
| **TC-10** | **Scoped Smooth Scroll** | Scroll on `/` and `/products/macbook-pro-14-m4`, then open the Cart Drawer and navigate to `/admin/orders`. | Storefront pages glide with Lenis smooth scroll, whereas drawers, modals, and `/admin/*` routes use crisp native scrolling with zero scroll-hijacking. |
