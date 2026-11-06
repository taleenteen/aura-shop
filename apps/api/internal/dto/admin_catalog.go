package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ProductInput creates or replaces a product and its variants from the admin editor.
// Stock is not set here except InitialStock on new variants; later changes go through
// stock adjustments so every change is recorded.
type ProductInput struct {
	Name             string          `json:"name"`
	Slug             string          `json:"slug"` // generated from name when empty
	CategoryID       uuid.UUID       `json:"category_id"`
	BrandID          uuid.UUID       `json:"brand_id"`
	Tagline          string          `json:"tagline"`
	ShortDescription string          `json:"short_description"`
	UsagePersonas    []string        `json:"usage_personas"`
	BentoHighlights  json.RawMessage `json:"bento_highlights"`
	BoxContents      json.RawMessage `json:"box_contents"`
	PortsDiagram     json.RawMessage `json:"ports_diagram"`
	FullSpecMatrix   json.RawMessage `json:"full_spec_matrix"`
	IsActive         bool            `json:"is_active"`
	Variants         []VariantInput  `json:"variants"`
}

type VariantInput struct {
	ID           *uuid.UUID             `json:"id,omitempty"` // set to update an existing variant
	SKU          string                 `json:"sku"`
	ColorName    string                 `json:"color_name"`
	ColorHex     string                 `json:"color_hex"`
	Price        int64                  `json:"price"`         // satang
	ComparePrice int64                  `json:"compare_price"` // satang; 0 = none
	Specs        map[string]interface{} `json:"specs"`
	Images       []string               `json:"images"`
	InitialStock int                    `json:"initial_stock"` // new variants only
}

// AdminProductListFilter selects a page of products in the admin list.
type AdminProductListFilter struct {
	Search   string
	Category string // slug
	Status   string // "active", "inactive" or "" for all
	Page     int
	Limit    int
}

type AdminProductSummary struct {
	ID            uuid.UUID `json:"id"`
	Slug          string    `json:"slug"`
	Name          string    `json:"name"`
	CategoryName  string    `json:"category_name"`
	BrandName     string    `json:"brand_name"`
	IsActive      bool      `json:"is_active"`
	VariantCount  int       `json:"variant_count"`
	StockTotal    int       `json:"stock_total"`
	ReservedTotal int       `json:"reserved_total"`
	LowStockCount int       `json:"low_stock_count"` // variants with <= 3 available
	MinPrice      int64     `json:"min_price"`
	Thumbnail     string    `json:"thumbnail"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type ProductStatusRequest struct {
	IsActive bool `json:"is_active"`
}

// StockAdjustmentRequest changes one variant's physical stock. Mode "delta" adds Quantity
// (may be negative); mode "set" makes the stock equal Quantity (a physical count).
// ExpectedStock is the stock the admin saw; the change is refused if it has moved since.
type StockAdjustmentRequest struct {
	Mode          string `json:"mode"`
	Quantity      int    `json:"quantity"`
	Reason        string `json:"reason"`
	Note          string `json:"note"`
	ExpectedStock *int   `json:"expected_stock"`
}

type StockAdjustmentResponse struct {
	VariantID      uuid.UUID `json:"variant_id"`
	SKU            string    `json:"sku"`
	StockQuantity  int       `json:"stock_quantity"`
	ReservedStock  int       `json:"reserved_stock"`
	AvailableStock int       `json:"available_stock"`
	Delta          int       `json:"delta"`
}

type UploadResponse struct {
	URL string `json:"url"`
}

// AdminCategory is a category with the number of products filed under it.
type AdminCategory struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	IconName     string    `json:"icon_name"`
	NavLabel     string    `json:"nav_label"`
	SortOrder    int       `json:"sort_order"`
	ProductCount int       `json:"product_count"`
}

// AdminBrand is a brand with the number of products that carry it.
type AdminBrand struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	LogoURL      string    `json:"logo_url"`
	ProductCount int       `json:"product_count"`
}

// CategoryInput creates or updates a category. An empty slug is derived from the name.
type CategoryInput struct {
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	NavLabel  string `json:"nav_label"`
	IconName  string `json:"icon_name"`
	SortOrder int    `json:"sort_order"`
}

// BrandInput creates or updates a brand. An empty slug is derived from the name.
type BrandInput struct {
	Name    string `json:"name"`
	Slug    string `json:"slug"`
	LogoURL string `json:"logo_url"`
}

// BannerInput creates or updates a banner. Dates are RFC 3339.
type BannerInput struct {
	Placement        string    `json:"placement"`
	GridSpan         string    `json:"grid_span"` // bento tile size: large, wide or standard (see service)
	ThemeMode        string    `json:"theme_mode"`
	BackgroundColor  string    `json:"background_color"`
	BadgeText        string    `json:"badge_text"`
	Headline         string    `json:"headline"`
	Subheadline      string    `json:"subheadline"`
	ProductImageURL  string    `json:"product_image_url"`
	CTAPrimaryText   string    `json:"cta_primary_text"`
	CTAPrimaryLink   string    `json:"cta_primary_link"`
	CTASecondaryText string    `json:"cta_secondary_text"`
	CTASecondaryLink string    `json:"cta_secondary_link"`
	SortOrder        int       `json:"sort_order"`
	IsActive         bool      `json:"is_active"`
	StartAt          time.Time `json:"start_at"`
	EndAt            time.Time `json:"end_at"`
}

// BannerStatus turns a banner on or off; the API answers with the new state in the same shape.
type BannerStatus struct {
	IsActive bool `json:"is_active"`
}

// ReviewVisibility hides or shows a review; the API answers with the new state in the same shape.
type ReviewVisibility struct {
	IsHidden bool `json:"is_hidden"`
}

// StockAlertView is a pending back-in-stock alert with the variant it waits for.
type StockAlertView struct {
	VariantID   uuid.UUID `json:"variant_id"`
	CreatedAt   time.Time `json:"created_at"`
	ProductName string    `json:"product_name"`
	ProductSlug string    `json:"product_slug"`
	Variant     string    `json:"variant"`
	Image       string    `json:"image"`
	Price       int64     `json:"price"`
}

// ReviewSummary is a product's average rating and how many reviews gave each star (index 0 = 1 star).
type ReviewSummary struct {
	Average      float64 `json:"average"`
	Count        int     `json:"count"`
	Distribution [5]int  `json:"distribution"`
}

// ReviewView is a published review. AuthorName is shortened before it is sent.
type ReviewView struct {
	ID         uuid.UUID `json:"id"`
	Rating     int       `json:"rating"`
	Title      string    `json:"title"`
	Body       string    `json:"body"`
	AuthorName string    `json:"author_name"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ReviewViewer tells the signed-in visitor whether they can review the product, and shows
// their own review (including one an admin hid).
type ReviewViewer struct {
	CanReview bool        `json:"can_review"`
	MyReview  *ReviewMine `json:"my_review"`
}

type ReviewMine struct {
	Rating   int    `json:"rating"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	IsHidden bool   `json:"is_hidden"`
}

// ProductReviews is one page of a product's reviews with its summary.
type ProductReviews struct {
	Summary ReviewSummary `json:"summary"`
	Reviews []ReviewView  `json:"reviews"`
	Viewer  *ReviewViewer `json:"viewer"` // nil for guests
}

type ReviewInput struct {
	Rating int    `json:"rating"`
	Title  string `json:"title"`
	Body   string `json:"body"`
}

type AdminReviewFilter struct {
	Status string // "", visible, hidden
	Rating int
	Search string
	Page   int
	Limit  int
}

type AdminReview struct {
	ID          uuid.UUID `json:"id"`
	Rating      int       `json:"rating"`
	Title       string    `json:"title"`
	Body        string    `json:"body"`
	IsHidden    bool      `json:"is_hidden"`
	CreatedAt   time.Time `json:"created_at"`
	AuthorName  string    `json:"author_name"`
	AuthorEmail string    `json:"author_email"`
	ProductName string    `json:"product_name"`
	ProductSlug string    `json:"product_slug"`
}

// ---------------------------------------------------------------- sales report

// SalesReport summarises paid orders between two store dates (inclusive).
type SalesReport struct {
	From     string           `json:"from"`
	To       string           `json:"to"`
	Group    string           `json:"group"` // day, week or month
	Totals   SalesTotals      `json:"totals"`
	Previous SalesTotals      `json:"previous"` // the same number of days just before From
	Series   []SalesPeriod    `json:"series"`
	Products []SalesBreakdown `json:"top_products"`
	Category []SalesBreakdown `json:"categories"`
	Payments []SalesBreakdown `json:"payment_methods"`
}

type SalesTotals struct {
	Orders            int64 `json:"orders"`
	Units             int64 `json:"units"`
	RevenueSatang     int64 `json:"revenue_satang"`
	AvgOrderSatang    int64 `json:"avg_order_satang"`
	RefundedOrders    int64 `json:"refunded_orders"` // paid, then cancelled by the store
	RefundedSatang    int64 `json:"refunded_satang"`
	NewCustomerOrders int64 `json:"new_customer_orders"` // first paid order of that email
}

type SalesPeriod struct {
	Start         string `json:"start"` // YYYY-MM-DD, store time
	Orders        int64  `json:"orders"`
	Units         int64  `json:"units"`
	RevenueSatang int64  `json:"revenue_satang"`
}

type SalesBreakdown struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	Orders        int64  `json:"orders"`
	Units         int64  `json:"units"`
	RevenueSatang int64  `json:"revenue_satang"`
}
