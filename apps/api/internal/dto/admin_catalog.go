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
