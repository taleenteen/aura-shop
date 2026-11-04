# Aura Tech Monorepo — Comprehensive Technical Audit & Reality Check

> **Generated:** November 2026  
> **Repository:** `aura-tech-monorepo` (`D:\Projects\e-commerce`)  
> **Target Scope:** `apps/api` (Go 1.24 / Chi / GORM) & `apps/web` (React 19 / Vite / TanStack Router / Tailwind CSS)

---

## 1. ACTUAL DIRECTORY & FILE TREE

### `apps/api` (Backend & Database Services)

| Relative Path | Current Functional Role |
| :--- | :--- |
| `.air.toml` | Live-reload configuration file for the Air tool during Go API local development. |
| `.dockerignore` | Excludes build artifacts, local environment variables, and temporary directories from Docker contexts. |
| `ca.crt` | Root certificate authority file generated for local SSL certificate validation in development. |
| `Dockerfile.dev` | Multi-stage Alpine development Dockerfile with Go 1.24, live reloading via Air, and CDN SSL mitigation rules. |
| `go.mod` | Go module definition declaring dependencies including Chi router, GORM, Postgres driver, MinIO SDK, and JWT. |
| `go.sum` | Checksum database for Go module dependencies verifying integrity of downloaded modules. |
| `IMAGE_GEN_TRACKER.md` | Local copy of the image generation checklist tracking transparent PNG status for SKUs and banners. |
| `cmd/assetgen/main.go` | Dedicated CLI pipeline to generate/download studio cutout PNGs, flood-fill white backgrounds to true alpha, upload to MinIO, and sync PostgreSQL. |
| `cmd/docgen/main.go` | Custom Go utility using unioffice to generate structured, formatted Word documents (.docx) from markdown documentation. |
| `cmd/seeder/main.go` | Standalone database seeder CLI that populates categories, brands, products, variants, banners, and sample admin users. |
| `cmd/server/main.go` | Main HTTP entry point configuring Chi router, CORS, middleware, GORM database connection, MinIO storage client, routes, and background stock cleaner worker. |
| `internal/config/config.go` | Environment variable parser loading PostgreSQL, MinIO, JWT, and server port settings with default fallbacks. |
| `internal/database/postgres.go` | Establishes PostgreSQL connection pool, runs GORM AutoMigrate, and creates GIN indexes for JSONB and trigram search. |
| `internal/database/seeder.go` | Core database seeding logic defining mock categories, brands, rich laptop/peripheral specifications, and dynamic banners. |
| `internal/dto/dto.go` | Request and response struct schemas for auth, checkout reservations, payments, and admin mutations. |
| `internal/handler/admin_handler.go` | Handles backoffice requests for dashboard metrics, low-stock alerts, banner creation, and order status transitions. |
| `internal/handler/auth_handler.go` | Handles customer/admin registration, login credential verification, and `/me` user profile queries. |
| `internal/handler/banner_handler.go` | Exposes active promotional banners categorized by placement (hero split, bento grid, top ribbon). |
| `internal/handler/cart_handler.go` | Exposes shopping cart retrieval, item insertion, quantity updates, and deletion for users and guests. |
| `internal/handler/catalog_handler.go` | Exposes catalog filtering, faceted search counts, dynamic spec querying, product details by slug, and multi-product comparison. |
| `internal/handler/checkout_handler.go` | Handles 15-minute stock reservations, payment execution, PromptPay QR simulation, and installment calculations. |
| `internal/handler/handler_test.go` | Unit tests for HTTP request validation, route handling, and status code responses. |
| `internal/handler/wishlist_handler.go` | Exposes wishlist item retrieval and toggle operations supporting both authenticated users and guest sessions. |
| `internal/middleware/context.go` | Defines typed context keys and helper functions for extracting authenticated user and guest session IDs. |
| `internal/middleware/guest_session.go` | Inspects `X-Guest-Session-ID` header or generates a fallback guest UUID for anonymous carts and wishlists. |
| `internal/middleware/jwt_auth.go` | Validates Bearer JWT tokens, injects claims into request context, and enforces authentication or admin role requirements. |
| `internal/middleware/logger.go` | Structured slog HTTP request logger tracking method, path, remote IP, status code, and latency. |
| `internal/middleware/middleware_test.go` | Unit tests for guest session header parsing and JWT authentication guard enforcement. |
| `internal/models/banner.go` | GORM model defining dynamic component-driven banners with placement, theme mode, background color, and CTA links. |
| `internal/models/catalog.go` | GORM models for Category, Brand, Product, ProductVariant, and ProductAccessoryBundle with JSONB specs and images. |
| `internal/models/interaction.go` | GORM models for Wishlist and CartItem supporting dual UserID and GuestSessionID ownership. |
| `internal/models/order.go` | GORM models for StockReservation, Order, and OrderItem with serial number fulfillment and lifecycle states. |
| `internal/models/user.go` | GORM model for User accounts storing hashed passwords, contact details, and role (CUSTOMER/ADMIN). |
| `internal/repository/banner_repository.go` | Database queries for fetching active banners filtered by placement and scheduling window. |
| `internal/repository/cart_repository.go` | Database queries for adding, updating, removing, and clearing cart items by user or guest session ID. |
| `internal/repository/catalog_repository.go` | Database queries for products, variants, categories, brands, faceted filtering, and multi-item comparison. |
| `internal/repository/order_repository.go` | Database transactions for creating stock reservations, updating order status, and releasing expired reservations. |
| `internal/repository/user_repository.go` | Database queries for creating users, looking up by email, and merging guest records into user accounts. |
| `internal/repository/wishlist_repository.go` | Database queries for retrieving wishlist items and toggling product presence by user or guest session ID. |
| `internal/response/response.go` | Standardized JSON response formatting helpers (`Success`, `Created`, `Error`, `Paginated`). |
| `internal/response/response_test.go` | Unit tests for standardized JSON response payload structures and HTTP status codes. |
| `internal/service/admin_service.go` | Business logic for computing dashboard revenue totals, low-stock threshold queries, and order fulfillment. |
| `internal/service/auth_service.go` | Business logic for bcrypt password hashing, JWT token issuance, and guest session cart/wishlist merging. |
| `internal/service/catalog_service.go` | Business logic for catalog faceted search, persona filters, price range filters, and spec comparisons. |
| `internal/service/checkout_service.go` | Business logic for atomic stock reservation soft-locking, mock payment processing, and installment math. |
| `internal/service/interaction_service.go` | Business logic for cart and wishlist manipulation across guest and registered user contexts. |
| `internal/service/service_test.go` | Unit tests for catalog filtering logic, cart subtotal calculations, and order creation. |
| `internal/service/testcases_test.go` | Concurrency and integration tests verifying stock soft-locks and parallel reservation safety. |
| `internal/storage/minio.go` | MinIO S3 client wrapper handling bucket creation, public read policies, and asset uploads. |

---

### `apps/web/src` (Frontend Storefront & Admin Application)

| Relative Path | Current Functional Role |
| :--- | :--- |
| `index.css` | Global Tailwind CSS imports, font declarations, and custom scrollbar styling. |
| `main.tsx` | React application entry point mounting `RouterProvider` and TanStack Query client to the DOM. |
| `vite-env.d.ts` | TypeScript compiler declarations for Vite client environment variables and SVG imports. |
| `app/lenis-manager.tsx` | Global wrapper configuring `@studio-freight/lenis` smooth scrolling on landing and PDP pages while disabling it elsewhere. |
| `app/root-layout.tsx` | Root storefront shell rendering TopRibbon, Navbar, Footer, CartDrawer, CompareModal, CompareFloatingTray, and CommandPalette. |
| `app/router.tsx` | TanStack Router configuration mapping URLs (`/`, `/catalog`, `/products/$slug`, `/checkout`, `/orders/$orderNumber`, `/admin`) to views. |
| `components/layout/footer.tsx` | 5-column enterprise footer displaying brand info, category links, legal disclaimers, and payment partner logos. |
| `components/layout/navbar.tsx` | Global navigation header with search trigger, category links, wishlist counter, cart toggle, and admin quick link. |
| `components/layout/top-ribbon.tsx` | Promotional header announcement banner displaying active campaigns from the backend API. |
| `components/ui/animated-price.tsx` | Animated number counter animating price changes smoothly using Framer Motion spring physics. |
| `features/admin/admin-layout.tsx` | Admin dashboard shell with 1-click admin authentication, security status banner, and tab switcher. |
| `features/admin/admin-overview.tsx` | High-level metrics view showing total sales, order counts, pending fulfillment, and low-stock inventory alerts. |
| `features/admin/banner-manager.tsx` | Visual editor for managing dynamic homepage banners, background gradients, badge texts, and CTA links. |
| `features/admin/order-sn-fulfillment.tsx` | Order state machine tool allowing administrators to inspect orders and assign hardware serial numbers to ship. |
| `features/banner/bento-promo-grid.tsx` | Responsive CSS bento grid rendering interactive promotional campaign tiles with transparent hardware cutouts. |
| `features/banner/hero-split-banner.tsx` | 60/40 split hero banner featuring animated typography, feature badges, and studio product imagery. |
| `features/cart/cart-drawer.tsx` | Slide-over shopping cart panel with item quantity adjustments, live subtotal calculations, and checkout routing. |
| `features/catalog/catalog-page.tsx` | Full-featured catalog view with non-linear price filters, facet chips, spec accordions, and sorting options. |
| `features/catalog/persona-quick-links.tsx` | One-click filter pill bar for instant filtering by usage persona (Creator, Gaming, Ultralight, Office). |
| `features/catalog/product-card.tsx` | Product display card featuring color swatches, dynamic price formatting, hover prefetching, and compare/wishlist triggers. |
| `features/checkout/checkout-page.tsx` | Two-column checkout flow with shipping address input, stock reservation timer, payment method tabs, and order summary. |
| `features/checkout/installment-calculator.tsx` | Interactive monthly payment calculation widget showing 0% interest breakdown across major Thai banks. |
| `features/checkout/interactive-card-form.tsx` | Credit card payment component featuring automatic Visa/Mastercard detection, card formatting, and visual card preview. |
| `features/checkout/order-receipt-page.tsx` | Post-purchase confirmation page displaying order status badge, fulfillment timeline, itemized receipt, and serial numbers. |
| `features/checkout/promptpay-qr-simulator.tsx` | Thai QR PromptPay payment component rendering dynamic QR codes and a developer webhook simulation button. |
| `features/checkout/reservation-timer.tsx` | 15-minute countdown clock warning users before temporary stock soft-locks expire. |
| `features/compare/compare-floating-tray.tsx` | Persistent floating bottom bar showing currently selected products for comparison with clear and open triggers. |
| `features/compare/compare-modal.tsx` | Fullscreen side-by-side spec comparison table for up to 3 products with a "Highlight Differences Only" filter. |
| `features/configurator/bento-highlights.tsx` | Visual feature matrix showcasing key hardware selling points in an asymmetric grid. |
| `features/configurator/bought-together.tsx` | Frequently bought together bundle section offering 1-click accessory additions with promotional discounts. |
| `features/configurator/cto-spec-selector.tsx` | Step-by-step configurator (Color, Chip, RAM, SSD) with live price deltas and layoutId border animations. |
| `features/configurator/full-spec-matrix.tsx` | Comprehensive technical specifications accordion detailing processor, display, memory, battery, and dimensions. |
| `features/configurator/help-modal.tsx` | Contextual "Help Me Choose" modal explaining differences between specs (e.g., M4 vs M4 Pro, RAM requirements). |
| `features/configurator/ports-and-box.tsx` | Visual diagram showing physical I/O ports and illustrated package contents. |
| `features/configurator/product-detail-page.tsx` | Core product detail page coordinating sticky image gallery, CTO configuration, bundle options, and checkout actions. |
| `features/configurator/sticky-gallery.tsx` | Left-side sticky image gallery with smooth cross-fade color switching and interactive thumbnail gallery. |
| `features/landing/landing-page.tsx` | Storefront homepage combining HeroSplitBanner, BentoPromoGrid, PersonaQuickLinks, and FeaturedProducts showcase. |
| `features/search/command-palette.tsx` | Keyboard-driven modal (`Cmd+K`/`Ctrl+K`) for instant product search with live debounce, categories, and quick navigation. |
| `features/wishlist/wishlist-heart-button.tsx` | 4-state micro-interaction heart button with hover beat, tap compression, liked spring burst, and 6 SVG particles. |
| `lib/api-client.ts` | Custom Fetch API wrapper injecting `X-Guest-Session-ID`, JWT Bearer token, base API URL, and standardized error handling. |
| `lib/currency.ts` | Utility function formatting integer Satang amounts into localized Thai Baht (`฿`) string representations. |
| `lib/utils.ts` | Tailwind CSS class concatenation and merging utility using `clsx` and `tailwind-merge`. |
| `stores/auth-store.ts` | Zustand store managing user authentication state, JWT tokens, guest session IDs, and persistent localStorage sync. |
| `stores/cart-store.ts` | Zustand store managing shopping cart drawer state, item list, total item count, and subtotal amounts. |
| `stores/compare-store.ts` | Zustand store managing compared product slugs (up to 3) and difference-only display toggle. |
| `stores/ui-store.ts` | Zustand store managing modal visibility states (cart drawer, command palette, compare modal). |
| `stores/wishlist-store.ts` | Zustand store managing wishlist product ID sets and synchronizing liked states with the backend. |
| `types/api.ts` | Comprehensive TypeScript interfaces for products, variants, banners, orders, cart items, categories, and API responses. |

---

## 2. BACKEND & DATABASE REALITY CHECK (`apps/api`)

### GORM Database Models (`internal/models`)

1. **`User` (`internal/models/user.go`)**
   - **Fields:** `ID` (UUID, PK), `Email` (string, unique index), `PasswordHash` (string, hidden in JSON), `FullName` (string), `Phone` (string), `Role` (varchar(20), default `CUSTOMER`, values `CUSTOMER` / `ADMIN`), `CreatedAt` (time), `UpdatedAt` (time).
   - **Indexes:** Unique index on `email`.

2. **`Category` (`internal/models/catalog.go`)**
   - **Fields:** `ID` (UUID, PK), `Slug` (string, unique index: `mac`, `ultrabooks`, `gaming-laptops`, `monitors`, `accessories`), `Name` (string), `IconName` (string, Lucide identifier), `SortOrder` (int, default 0).

3. **`Brand` (`internal/models/catalog.go`)**
   - **Fields:** `ID` (UUID, PK), `Slug` (string, unique index: `apple`, `asus`, `lenovo`, `dell`, `msi`, `lg`, `keychron`), `Name` (string), `LogoURL` (string).

4. **`Product` (`internal/models/catalog.go`)**
   - **Fields:** `ID` (UUID, PK), `Slug` (string, unique index), `Name` (string, indexed), `CategoryID` (UUID, FK, indexed), `BrandID` (UUID, FK, indexed), `Tagline` (string), `ShortDescription` (string), `BasePrice` (int64 Satang, indexed), `UsagePersonas` (`datatypes.JSON`, JSONB array: `["CREATOR", "GAMING", "ULTRALIGHT", "OFFICE"]`), `BentoHighlights` (`datatypes.JSON`, JSONB), `BoxContents` (`datatypes.JSON`, JSONB), `PortsDiagram` (`datatypes.JSON`, JSONB), `FullSpecMatrix` (`datatypes.JSON`, JSONB), `IsActive` (bool, default true), `Variants` (`[]ProductVariant`), `AccessoryBundles` (`[]ProductAccessoryBundle`), `CreatedAt` (time), `UpdatedAt` (time).
   - **Indexes:** GIN index on `usage_personas`, Trigram GIN index on `name` (`idx_products_name_trgm`), standard B-tree indexes on `slug`, `category_id`, `brand_id`, `base_price`.

5. **`ProductVariant` (`internal/models/catalog.go`)**
   - **Fields:** `ID` (UUID, PK), `ProductID` (UUID, FK, indexed), `SKU` (string, unique index, e.g. `MBP14-M4P-24-512-SB`), `ColorName` (string), `ColorHex` (string), `Price` (int64 Satang, indexed), `ComparePrice` (int64 Satang), `StockQuantity` (int, default 0), `ReservedStock` (int, default 0), `Specs` (`datatypes.JSON`, JSONB: chip, ram, storage, display, etc.), `Images` (`datatypes.JSON`, JSONB string array of URLs).
   - **Indexes:** GIN index on `specs` (`idx_product_variants_specs`), unique index on `sku`, standard B-tree index on `price`.

6. **`ProductAccessoryBundle` (`internal/models/catalog.go`)**
   - **Fields:** `ID` (UUID, PK), `MainProductID` (UUID, FK, indexed), `AccessoryProductID` (UUID, FK), `AccessoryProduct` (`Product`), `BundleDiscountPct` (int, default 10).

7. **`Banner` (`internal/models/banner.go`)**
   - **Fields:** `ID` (UUID, PK), `Placement` (string, indexed: `HERO_SPLIT`, `BENTO_GRID`, `TOP_RIBBON`), `GridSpan` (string, e.g. `col-span-2 row-span-2`), `ThemeMode` (string, `DARK` or `LIGHT`), `BackgroundColor` (string, hex or CSS gradient), `BadgeText` (string), `Headline` (string), `Subheadline` (string), `ProductImageURL` (string), `CTAPrimaryText` (string), `CTAPrimaryLink` (string), `CTASecondaryText` (string), `CTASecondaryLink` (string), `SortOrder` (int), `IsActive` (bool), `StartAt` (time, indexed), `EndAt` (time, indexed), `CreatedAt` (time).

8. **`Wishlist` (`internal/models/interaction.go`)**
   - **Fields:** `ID` (UUID, PK), `UserID` (*UUID, indexed, nullable), `GuestSessionID` (*string, varchar(64), indexed, nullable), `ProductID` (UUID, FK, indexed), `Product` (`Product`), `CreatedAt` (time).

9. **`CartItem` (`internal/models/interaction.go`)**
   - **Fields:** `ID` (UUID, PK), `UserID` (*UUID, indexed, nullable), `GuestSessionID` (*string, varchar(64), indexed, nullable), `VariantID` (UUID, FK), `Variant` (`ProductVariant`), `Quantity` (int, default 1), `UpdatedAt` (time).

10. **`StockReservation` (`internal/models/order.go`)**
    - **Fields:** `ID` (UUID, PK), `OrderID` (UUID, FK, indexed), `VariantID` (UUID, FK, indexed), `Quantity` (int), `ExpiresAt` (time, indexed: `CreatedAt + 15m`), `Status` (string, default `ACTIVE`, values `ACTIVE` / `COMMITTED` / `RELEASED`).

11. **`Order` (`internal/models/order.go`)**
    - **Fields:** `ID` (UUID, PK), `OrderNumber` (string, unique index: `AURA-YYYYMMDD-XXXX`), `UserID` (*UUID, indexed, nullable), `GuestSessionID` (*string, varchar(64), indexed, nullable), `CustomerEmail` (string), `Status` (string, indexed: `PENDING_PAYMENT`, `PAID_PROCESSING`, `SN_ASSIGNED`, `SHIPPED`, `DELIVERED`, `CANCELLED`), `SubtotalAmount` (int64 Satang), `DiscountAmount` (int64 Satang), `GrandTotal` (int64 Satang), `ShippingAddress` (`datatypes.JSON`, JSONB), `PaymentMethod` (string: `PROMPTPAY_QR`, `CREDIT_CARD`, `INSTALLMENT_0`), `InstallmentPlan` (`datatypes.JSON`, JSONB), `ReservationExpiresAt` (time), `Items` (`[]OrderItem`), `CreatedAt` (time), `UpdatedAt` (time).

12. **`OrderItem` (`internal/models/order.go`)**
    - **Fields:** `ID` (UUID, PK), `OrderID` (UUID, FK, indexed), `VariantID` (UUID), `SKUSnapshot` (string), `NameSnapshot` (string), `SpecSummary` (string), `UnitPrice` (int64 Satang), `Quantity` (int), `SerialNumber` (string, indexed, mandatory before `SHIPPED`).

---

### Registered HTTP API Endpoints

All 24 routes are registered in `apps/api/cmd/server/main.go` and executed against real database models:

| HTTP Method & Path | Handler File | Connected to Real DB? | Key Logic / Edge Cases Handled | Missing or Simplified Parts |
| :--- | :--- | :--- | :--- | :--- |
| `GET /health` | `cmd/server/main.go` | No | Liveness probe returning JSON status. | No deep DB ping in probe. |
| `POST /api/v1/auth/register` | `internal/handler/auth_handler.go` | **Yes** | Bcrypt hash cost 12, duplicate email check, guest session cart/wishlist auto-merge. | No email verification email sent. |
| `POST /api/v1/auth/login` | `internal/handler/auth_handler.go` | **Yes** | Verifies password hash, issues 72h JWT token, auto-merges guest cart and wishlist. | No refresh token rotation. |
| `GET /api/v1/auth/me` | `internal/handler/auth_handler.go` | **Yes** | Guarded by `RequireAuth` JWT middleware, returns full user profile. | None. |
| `GET /api/v1/banners` | `internal/handler/banner_handler.go` | **Yes** | Filters by `is_active = true` and `start_at <= NOW() <= end_at`, groups by placement. | No click-through tracking. |
| `GET /api/v1/categories` | `internal/handler/catalog_handler.go` | **Yes** | Fetches active categories ordered by `sort_order ASC`. | None. |
| `GET /api/v1/brands` | `internal/handler/catalog_handler.go` | **Yes** | Fetches brands sorted alphabetically by name. | None. |
| `GET /api/v1/catalog` | `internal/handler/catalog_handler.go` | **Yes** | Dynamic multi-faceted filtering: category, brand, usage persona (JSONB array), CPU/RAM/Storage (JSONB variant specs), price range (Satang), sorting, pagination, and live filter counts. | None. |
| `GET /api/v1/products/compare` | `internal/handler/catalog_handler.go` | **Yes** | Accepts comma-separated slugs (`?slugs=...`), fetches up to 3 products with full variants and spec matrices. | Maximum cap of 3 strictly enforced. |
| `GET /api/v1/products/{slug}` | `internal/handler/catalog_handler.go` | **Yes** | Fetches product by slug with all active variants, category, brand, and accessory bundles. | 404 handled if inactive or missing. |
| `GET /api/v1/search` | `internal/handler/catalog_handler.go` | **Yes** | Uses PostgreSQL pg_trgm trigram similarity search across product name and tagline. | Fallback ILIKE if search term is short. |
| `GET /api/v1/wishlist` | `internal/handler/wishlist_handler.go` | **Yes** | Resolves items by `user_id` (if authenticated) or `guest_session_id`. | None. |
| `POST /api/v1/wishlist/toggle` | `internal/handler/wishlist_handler.go` | **Yes** | Idempotent toggle: adds if missing, deletes if already exists for user/guest. | None. |
| `GET /api/v1/cart` | `internal/handler/cart_handler.go` | **Yes** | Retrieves active cart items, calculates line totals and subtotal in Satang. | Excludes out-of-stock validation during read. |
| `POST /api/v1/cart/items` | `internal/handler/cart_handler.go` | **Yes** | Upserts variant in cart, validates available stock (`stock_quantity - reserved_stock`). | None. |
| `PATCH /api/v1/cart/items/{id}` | `internal/handler/cart_handler.go` | **Yes** | Updates quantity, validates against live stock availability. | None. |
| `DELETE /api/v1/cart/items/{id}`| `internal/handler/cart_handler.go` | **Yes** | Removes specific line item by UUID from user/guest cart. | None. |
| `POST /api/v1/checkout/reserve` | `internal/handler/checkout_handler.go` | **Yes** | Atomic SQL transaction: soft-locks stock (`reserved_stock += qty`), creates `StockReservation` with 15-minute expiration, creates `Order` in `PENDING_PAYMENT`. | Background worker periodically cleans expired reservations. |
| `POST /api/v1/checkout/pay` | `internal/handler/checkout_handler.go` | **Yes** | Atomic SQL transaction: commits soft-lock to permanent decrement (`stock_quantity -= qty`, `reserved_stock -= qty`), marks reservation `COMMITTED`, updates order to `PAID_PROCESSING`, clears cart. | Payment is simulated via mock gateway. |
| `GET /api/v1/checkout/promptpay/{orderNumber}` | `internal/handler/checkout_handler.go` | **Yes** | Generates EMVCo Thai QR PromptPay payload and SVG/data URL with exact Satang amount. | Standard test PromptPay ID used. |
| `GET /api/v1/checkout/installments/{satangAmount}` | `internal/handler/checkout_handler.go` | **Yes** | Computes 0% installment plans across Kasikorn, SCB, KTC, and BBL for 3, 6, and 10-month terms. | Only 0% promotional tier supported. |
| `GET /api/v1/orders/{orderNumber}` | `internal/handler/checkout_handler.go` | **Yes** | Fetches full order receipt, items, snapshots, and assigned hardware serial numbers. | None. |
| `GET /api/v1/admin/overview` | `internal/handler/admin_handler.go` | **Yes** | Protected by `RequireAdmin`, computes total sales volume, order counts by status, and low-stock SKUs (`stock <= 5`). | Overview queries table directly without caching. |
| `POST /api/v1/admin/banners` | `internal/handler/admin_handler.go` | **Yes** | Protected by `RequireAdmin`, creates new component-driven banner. | None. |
| `POST /api/v1/admin/products` | `internal/handler/admin_handler.go` | **Yes** | Protected by `RequireAdmin`, creates new product with variants in a single transaction. | None. |
| `PATCH /api/v1/admin/orders/{id}/status` | `internal/handler/admin_handler.go` | **Yes** | Protected by `RequireAdmin`, enforces order state machine. Requires `serial_number` on items before moving to `SHIPPED`. | None. |

---

### Seeder & Asset Generation Reality Check

- **`cmd/seeder/main.go` & `internal/database/seeder.go`:**
  - Seeds 5 Categories: `mac`, `ultrabooks`, `gaming-laptops`, `monitors`, `accessories`.
  - Seeds 7 Brands: `Apple`, `ASUS`, `Lenovo`, `Dell`, `MSI`, `LG`, `Keychron`.
  - Seeds 5 Core Products:
    1. *MacBook Pro 14-inch (M4 / M4 Pro)* — 4 variants (`Space Black`, `Silver`).
    2. *Lenovo Yoga Slim 7i Aura Edition 15"* — 2 variants (`Luna Grey`).
    3. *ASUS ROG Zephyrus G16 (2024) OLED* — 2 variants (`Eclipse Gray`, `Platinum White`).
    4. *LG UltraFine 27" 5K Display* — 1 variant (`Matte Black`).
    5. *Keychron Q1 Pro Wireless Mechanical Keyboard* — 2 variants (`Carbon Black`, `Shell White`).
  - Total Product Variants: **14 SKUs**.
  - Seeds 3 Component-Driven Dynamic Banners (`HERO_SPLIT`, `BENTO_GRID`, `TOP_RIBBON`).
  - Seeds 1 Administrator User: `admin@auratech.co.th` / `password123`.

- **`cmd/assetgen/main.go` & MinIO (`aura-assets`):**
  - All 17 assets (14 product variant cutouts + 3 promotional banners) were processed, verified, and uploaded to MinIO.
  - Opaque white studio borders were converted into true alpha transparent PNGs via flood-fill cutout.
  - Postgres database records in `product_variants.images` and `banners.product_image_url` are actively pointing to local MinIO URLs (`http://localhost:9000/aura-assets/...`).
  - Status tracked in `IMAGE_GEN_TRACKER.md`: **17/17 (100%) Production OK**.

---

## 3. FRONTEND PAGE-BY-PAGE BREAKDOWN (`apps/web`)

### Page 1: Landing Page (`/`)
- **Component:** `LandingPage` (`src/features/landing/landing-page.tsx`)
- **Real API Endpoints:**
  - `GET /api/v1/banners` (Hero banner and bento campaign promotions)
  - `GET /api/v1/catalog?page=1&per_page=8` (Featured hardware grid)
- **State Management:**
  - Local state for active carousel indexes and hover states.
  - Zustand `useWishlistStore` for heart toggles.
  - Zustand `useCartStore` for 1-click cart addition.
- **UI/UX Polish:**
  - Lenis smooth scrolling active.
  - Dynamic theme-adaptive text on Hero split banner (auto contrast against dark/light background gradients).
  - Bento Grid layout with hover zoom and badge animations.
  - Usage persona quick-filter pills (Creator, Gaming, Ultralight, Office) linking directly to catalog with pre-selected filters.
- **Rough Edges:**
  - Carousel autoplay does not pause automatically on keyboard focus (only on mouse hover).

---

### Page 2: Catalog Filter Page (`/catalog`)
- **Component:** `CatalogPage` (`src/features/catalog/catalog-page.tsx`)
- **Real API Endpoints:**
  - `GET /api/v1/catalog` (Filtered query with facet parameters)
  - `GET /api/v1/categories` (Category filter list)
  - `GET /api/v1/brands` (Brand filter list)
- **State Management:**
  - **URL Search Params:** Fully bidirectional with browser URL (`category`, `brand`, `persona`, `cpu`, `ram`, `storage`, `min_price`, `max_price`, `sort`, `page`).
  - Zustand `useCompareStore` for managing product comparison selections.
  - Zustand `useWishlistStore` for product wishlist persistence.
- **UI/UX Polish:**
  - Motion `layout` animations when filtering products.
  - Non-linear price chips with quick-select price tiers.
  - Live facet counters next to filter checkboxes (disables 0-count options).
  - 150ms intent-based hover prefetching on product cards (`prefetchQuery` into TanStack Query cache).
- **Rough Edges:**
  - Mobile filter sheet layout could use a sticky "Apply Filters" floating bottom action bar when scrolling long filter lists on small screens.

---

### Page 3: Product Detail Page & CTO Configurator (`/products/$slug`)
- **Component:** `ProductDetailPage` (`src/features/configurator/product-detail-page.tsx`)
- **Real API Endpoints:**
  - `GET /api/v1/products/{slug}` (Full product with variants, spec matrices, bento highlights, and box contents)
  - `POST /api/v1/cart/items` (Add configured SKU to cart)
- **State Management:**
  - Local state for selected CTO spec combinations (Color, CPU, RAM, SSD).
  - Zustand `useCartStore` to trigger slide-over drawer upon item addition.
  - Zustand `useUIStore` to open contextual "Help Me Choose" modal.
- **UI/UX Polish:**
  - Sticky left-side image gallery with cross-fade animation when switching colors.
  - Step-by-step CTO spec selector with animated `layoutId` active borders and dynamic price deltas (`+ ฿7,000`).
  - Animated price counter (`AnimatedPrice`) transitioning total amount with spring physics.
  - Interactive Bento Highlights, Ports & Package Diagram, and full technical specifications matrix.
- **Rough Edges:**
  - Frequently Bought Together bundle UI is implemented in `bought-together.tsx`, but no mock accessory bundles are currently linked to laptops in `internal/database/seeder.go` (bundle query returns an empty array).

---

### Page 4: Checkout & Reservation Flow (`/checkout`)
- **Component:** `CheckoutPage` (`src/features/checkout/checkout-page.tsx`)
- **Real API Endpoints:**
  - `GET /api/v1/cart` (Cart summary)
  - `POST /api/v1/checkout/reserve` (15-minute stock lock)
  - `POST /api/v1/checkout/pay` (Payment execution)
  - `GET /api/v1/checkout/promptpay/{orderNumber}` (Thai QR generation)
  - `GET /api/v1/checkout/installments/{amount}` (0% installment breakdown)
- **State Management:**
  - Step state machine (`SHIPPING` -> `PAYMENT` -> `CONFIRMATION`).
  - Form state for shipping address.
  - Active reservation timer state synchronized with backend `expires_at`.
- **UI/UX Polish:**
  - Active 15-minute reservation countdown timer with warning colors when under 3 minutes.
  - Interactive Credit Card form with automatic Visa/Mastercard detection, number masking, and card flip.
  - Thai QR PromptPay component with a "Simulate Webhook Scan Success" developer trigger.
  - Bank selector for 0% installment plans showing monthly breakdown.
- **Rough Edges:**
  - Lenis smooth scrolling is intentionally disabled on checkout to prevent momentum scroll interference with form inputs.

---

### Page 5: Order Receipt & Fulfillment Status (`/orders/$orderNumber`)
- **Component:** `OrderReceiptPage` (`src/features/checkout/order-receipt-page.tsx`)
- **Real API Endpoints:**
  - `GET /api/v1/orders/{orderNumber}` (Full order status and item snapshots)
- **State Management:**
  - TanStack Query polling order status.
- **UI/UX Polish:**
  - Dynamic status timeline badge (`PAID_PROCESSING` -> `SN_ASSIGNED` -> `SHIPPED` -> `DELIVERED`).
  - Displays hardware serial numbers assigned by warehouse administrators.
  - Print/Download receipt action and shipping address snapshot.
- **Rough Edges:**
  - Order tracking does not currently provide external carrier webhook URLs (e.g., Kerry Express / Thailand Post tracking links).

---

### Page 6: Admin Backoffice Operations Console (`/admin`)
- **Component:** `AdminLayout` (`src/features/admin/admin-layout.tsx`)
- **Real API Endpoints:**
  - `POST /api/v1/auth/login` (Admin quick sign-in)
  - `GET /api/v1/admin/overview` (Metrics & low-stock alerts)
  - `POST /api/v1/admin/banners` (Create campaign banners)
  - `PATCH /api/v1/admin/orders/{id}/status` (Order state transitions & serial number assignment)
- **State Management:**
  - URL search param tab state (`tab=overview`, `tab=banners`, `tab=orders`).
  - Zustand `useAuthStore` enforcing admin role tokens.
- **UI/UX Polish:**
  - 1-Click admin authentication button for rapid development testing.
  - Low-stock inventory table with warning badges (`<= 5 units`).
  - Visual dynamic banner creator with real-time gradient and typography preview.
  - Order fulfillment tool enforcing serial number validation before status transitions to `SHIPPED`.
- **Rough Edges:**
  - Revenue charts in `AdminOverview` currently display static metric cards rather than a time-series graph (e.g. Recharts or Chart.js).

---

## 4. COMPONENT-BY-COMPONENT INVENTORY

### Layout & Global Components

1. **`Navbar` (`src/components/layout/navbar.tsx`)**
   - **Props:** None (connected to global stores).
   - **Data Flow:** Reads `useCartStore` (item count), `useWishlistStore` (wishlist count), and `useAuthStore` (login state).
   - **Interactive Polish:** Sticky blur backdrop (`backdrop-blur-md`), `Cmd+K` search shortcut badge, animated badge counters on cart and wishlist icons.
   - **Limitations:** Mobile navigation menu is a simple collapsible list rather than a full animated overlay drawer.

2. **`Footer` (`src/components/layout/footer.tsx`)**
   - **Props:** None.
   - **Data Flow:** Static navigation links and live dynamic copyright year.
   - **Interactive Polish:** 5-column enterprise typography, payment partner badges (PromptPay, Visa, Mastercard), and social icons.

3. **`TopRibbon` (`src/components/layout/top-ribbon.tsx`)**
   - **Props:** None.
   - **Data Flow:** Queries `/api/v1/banners` for placement `TOP_RIBBON`.
   - **Interactive Polish:** Auto-hides if no active top ribbon banners exist; subtle slide-in animation.

4. **`AnimatedPrice` (`src/components/ui/animated-price.tsx`)**
   - **Props:** `amount: number` (in Satang), `className?: string`.
   - **Data Flow:** Formats Satang into THB and animates number transitions using Framer Motion springs.
   - **Interactive Polish:** Smoothly counts up/down when CTO configuration specs are selected.

---

### Navigation & Modal Drawers

5. **`CommandPalette` (`src/features/search/command-palette.tsx`)**
   - **Props:** None.
   - **Data Flow:** Debounced search queries to `GET /api/v1/search?q=...`. Controlled via `useUIStore.isCommandPaletteOpen`.
   - **Interactive Polish:** Keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`), shortcut listener (`Cmd+K` / `Ctrl+K`), backdrop blur, direct category jumping.

6. **`CompareModal` & `CompareFloatingTray` (`src/features/compare/`)**
   - **Props:** None.
   - **Data Flow:** Uses `useCompareStore` to query `GET /api/v1/products/compare?slugs=...`.
   - **Interactive Polish:** Persistent floating pill tray showing compared items with thumbnails; fullscreen comparison modal with a "Show Only Differences" toggle.
   - **Limitations:** Capped at 3 products maximum.

7. **`CartDrawer` (`src/features/cart/cart-drawer.tsx`)**
   - **Props:** None.
   - **Data Flow:** Uses `useCartStore` to query `GET /api/v1/cart`, `PATCH /api/v1/cart/items/{id}`, and `DELETE /api/v1/cart/items/{id}`.
   - **Interactive Polish:** Slide-over Framer Motion drawer, live quantity increment/decrement, dynamic free shipping progress bar, direct "Proceed to Checkout" link.

8. **`WishlistHeartButton` (`src/features/wishlist/wishlist-heart-button.tsx`)**
   - **Props:** `productId: string`, `size?: number`, `className?: string`.
   - **Data Flow:** Uses `useWishlistStore` to trigger `POST /api/v1/wishlist/toggle`.
   - **Interactive Polish:** 4-state micro-interaction:
     1. `Idle`: Subtle outline.
     2. `Hover`: Gentle heartbeat scale pulse (`scale: 1.15`).
     3. `Tap`: Compression (`scale: 0.85`).
     4. `Liked`: Bouncy spring pop + 6 bursting SVG micro-particles radiating outwards.

---

### Catalog & PDP Components

9. **`ProductCard` (`src/features/catalog/product-card.tsx`)**
   - **Props:** `product: Product`.
   - **Data Flow:** Prefetches product detail data into TanStack Query on 150ms hover; triggers compare and wishlist stores.
   - **Interactive Polish:** Interactive color finishing dots that swap the card photo preview, usage persona tags, animated price formatting.

10. **`StickyGallery` (`src/features/configurator/sticky-gallery.tsx`)**
    - **Props:** `images: string[]`, `productName: string`, `selectedColor: string`.
    - **Data Flow:** Renders primary image and thumbnail strip; cross-fades when `selectedColor` changes.
    - **Interactive Polish:** CSS `position: sticky; top: 6rem;` with Framer Motion `AnimatePresence` cross-fade.
    - **Limitations:** Lacks an expanded fullscreen lightbox zoom modal.

11. **`CTOSpecSelector` (`src/features/configurator/cto-spec-selector.tsx`)**
    - **Props:** `variants: ProductVariant[]`, `selectedVariant: ProductVariant`, `onSelectVariant: (v: ProductVariant) => void`.
    - **Data Flow:** Calculates price deltas (`+ ฿7,000` or `Base`) relative to the currently active finish and spec tier.
    - **Interactive Polish:** Framer Motion `layoutId="active-spec-border"` ring that smoothly glides between selected options.

12. **`BentoHighlights` (`src/features/configurator/bento-highlights.tsx`)**
    - **Props:** `highlights: BentoHighlight[]`.
    - **Data Flow:** Reads JSONB bento specifications from product model.
    - **Interactive Polish:** Asymmetric modern Bento card grid with high-contrast typography and subtle glassmorphic styling.

13. **`PortsAndBox` (`src/features/configurator/ports-and-box.tsx`)**
    - **Props:** `boxContents: BoxContent[]`, `portsDiagram: PortsDiagram`.
    - **Data Flow:** Visual diagram illustrating package contents and physical port placements.

14. **`FullSpecMatrix` (`src/features/configurator/full-spec-matrix.tsx`)**
    - **Props:** `specs: SpecMatrixCategory[]`.
    - **Data Flow:** Collapsible accordion rendering processor, memory, storage, display, battery, and dimensions specifications.

15. **`HelpModal` (`src/features/configurator/help-modal.tsx`)**
    - **Props:** `topic: string`, `isOpen: boolean`, `onClose: () => void`.
    - **Data Flow:** Contextual advice helping buyers choose between memory configurations and processor tiers.

---

### Checkout & Admin Components

16. **`ReservationTimer` (`src/features/checkout/reservation-timer.tsx`)**
    - **Props:** `expiresAt: string`, `onExpired: () => void`.
    - **Data Flow:** Calculates remaining seconds against server expiration timestamp.
    - **Interactive Polish:** Color transitions from emerald (`> 5m`) to amber (`2-5m`) to pulse red (`< 2m`).

17. **`InteractiveCardForm` (`src/features/checkout/interactive-card-form.tsx`)**
    - **Props:** `onSubmit: (cardData: CardDetails) => void`.
    - **Data Flow:** Auto-formats credit card number with spaces, auto-detects Visa/Mastercard from BIN prefixes, validates Luhn checksum.
    - **Interactive Polish:** 3D card preview displaying live typed name, formatted expiry, and masked numbers.

18. **`PromptPayQRSimulator` (`src/features/checkout/promptpay-qr-simulator.tsx`)**
    - **Props:** `orderNumber: string`, `amount: number`, `onPaymentSuccess: () => void`.
    - **Data Flow:** Displays official EMVCo Thai QR code and provides a simulated webhook success button for local testing.

19. **`InstallmentCalculator` (`src/features/checkout/installment-calculator.tsx`)**
    - **Props:** `amount: number`.
    - **Data Flow:** Queries `/api/v1/checkout/installments/{amount}` and renders bank breakdown cards for 3, 6, and 10 months at 0% interest.

20. **`AdminOverview` (`src/features/admin/admin-overview.tsx`)**
    - **Props:** None.
    - **Data Flow:** Queries `GET /api/v1/admin/overview`.
    - **Interactive Polish:** Metric cards (Total Revenue, Total Orders, Paid Orders, Low-Stock Alert Count) and inventory table.

21. **`BannerManager` (`src/features/admin/banner-manager.tsx`)**
    - **Props:** None.
    - **Data Flow:** Queries `GET /api/v1/banners` and submits `POST /api/v1/admin/banners`.
    - **Interactive Polish:** Real-time visual banner preview showing gradient backgrounds, badge text, and layout spans.

22. **`OrderSNFulfillment` (`src/features/admin/order-sn-fulfillment.tsx`)**
    - **Props:** None.
    - **Data Flow:** Queries `GET /api/v1/orders/{orderNumber}` and submits `PATCH /api/v1/admin/orders/{id}/status`.
    - **Interactive Polish:** Enforces serial number entry before transition from `PAID_PROCESSING` to `SHIPPED`.

---

## 5. TOP 10 GAPS & IMPROVEMENT OPPORTUNITIES

1. **Frequently Bought Together Bundle Data in Seeder:**
   - *Status:* The frontend component (`bought-together.tsx`) is built and tested, but `apps/api/internal/database/seeder.go` does not populate `accessory_bundles` records in PostgreSQL. Linking the LG 5K monitor and Keychron keyboard as bundles for the MacBook Pro will immediately activate 1-click bundle purchases.

2. **Interactive User Authentication Modal:**
   - *Status:* Backend JWT auth, password hashing, and guest cart merging are fully working via API, but the frontend lacks a persistent "Sign In / Register" modal dialog triggered from the Navbar (currently, only an admin quick sign-in button exists in `/admin`).

3. **PDP Fullscreen Lightbox & Image Zoom:**
   - *Status:* The sticky gallery cleanly cross-fades between colors, but clicking on a high-resolution product image does not yet open an expanded zoom modal or 360-degree interactive viewer.

4. **Visual Analytics Charts in Admin Dashboard:**
   - *Status:* `AdminOverview` renders statistical cards and table rows, but lacks time-series visual charts (e.g., Recharts) for daily/weekly revenue trends and category sales distribution.

5. **Admin Order Table with Direct Row Selection:**
   - *Status:* `OrderSNFulfillment` currently requires typing or pasting an order number into a search box. Adding a paginated orders list table in the admin panel where clicking an order opens the fulfillment drawer will significantly improve warehouse usability.

6. **Customer Reviews & Ratings System:**
   - *Status:* The codebase currently has no customer review model, ratings aggregation, or review submission form on the PDP.

7. **Multi-Currency & Internationalization Support:**
   - *Status:* Satang-to-THB conversion is rock solid throughout the codebase, but there is no toggle for USD currency conversion or English/Thai dual language strings.

8. **Mobile Navigation Overlay Drawer:**
   - *Status:* On mobile viewports, the navbar collapses into a basic dropdown menu rather than a smooth, full-height animated gesture drawer.

9. **External Shipment Tracking Webhook Integrations:**
   - *Status:* The order state machine moves cleanly to `SHIPPED` upon serial number assignment, but does not yet integrate with live carrier tracking APIs (e.g. Thailand Post or Kerry Express tracking numbers).

10. **End-to-End Playwright Automated Test Suite:**
    - *Status:* Backend unit and concurrency tests (`testcases_test.go`) and frontend unit tests are passing, but an automated browser end-to-end test suite (exercising Catalog -> Configurator -> Cart Drawer -> Checkout -> Mock Payment) should be established to prevent regressions.

---

*Report compiled directly from on-disk codebase inspection.*
