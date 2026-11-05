package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Category struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Slug      string    `gorm:"uniqueIndex;not null" json:"slug"` // mac, ultrabooks, gaming-laptops, monitors, accessories
	Name      string    `gorm:"not null" json:"name"`
	IconName  string    `json:"icon_name"`                            // Lucide icon identifier
	NavLabel  string    `gorm:"not null;default:''" json:"nav_label"` // short label in the top menu; empty keeps it out of the menu
	SortOrder int       `gorm:"default:0" json:"sort_order"`
}

type Brand struct {
	ID      uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Slug    string    `gorm:"uniqueIndex;not null" json:"slug"` // apple, asus, lenovo, dell, msi, lg, keychron
	Name    string    `gorm:"not null" json:"name"`
	LogoURL string    `json:"logo_url"`
}

type Product struct {
	ID               uuid.UUID                `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Slug             string                   `gorm:"uniqueIndex;not null" json:"slug"`
	Name             string                   `gorm:"index;not null" json:"name"`
	CategoryID       uuid.UUID                `gorm:"type:uuid;index;not null" json:"category_id"`
	Category         Category                 `gorm:"foreignKey:CategoryID" json:"category"`
	BrandID          uuid.UUID                `gorm:"type:uuid;index;not null" json:"brand_id"`
	Brand            Brand                    `gorm:"foreignKey:BrandID" json:"brand"`
	Tagline          string                   `json:"tagline"`
	ShortDescription string                   `json:"short_description"`
	BasePrice        int64                    `gorm:"not null;index" json:"base_price"` // Lowest variant price in Satang
	UsagePersonas    datatypes.JSON           `gorm:"type:jsonb" json:"usage_personas"` // ["CREATOR", "GAMING", "ULTRALIGHT", "OFFICE"]
	BentoHighlights  datatypes.JSON           `gorm:"type:jsonb" json:"bento_highlights"`
	BoxContents      datatypes.JSON           `gorm:"type:jsonb" json:"box_contents"`
	PortsDiagram     datatypes.JSON           `gorm:"type:jsonb" json:"ports_diagram"`
	FullSpecMatrix   datatypes.JSON           `gorm:"type:jsonb" json:"full_spec_matrix"`
	IsActive         bool                     `gorm:"default:true" json:"is_active"`
	Variants         []ProductVariant         `gorm:"foreignKey:ProductID" json:"variants"`
	AccessoryBundles []ProductAccessoryBundle `gorm:"foreignKey:MainProductID" json:"accessory_bundles,omitempty"`
	CreatedAt        time.Time                `json:"created_at"`
	UpdatedAt        time.Time                `json:"updated_at"`
}

type ProductVariant struct {
	ID            uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ProductID     uuid.UUID      `gorm:"type:uuid;index;not null" json:"product_id"`
	Product       *Product       `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	SKU           string         `gorm:"uniqueIndex;not null" json:"sku"` // e.g., "MBP14-M4P-24-512-SB"
	ColorName     string         `gorm:"not null" json:"color_name"`      // e.g., "Space Black"
	ColorHex      string         `gorm:"not null" json:"color_hex"`       // e.g., "#2E2C2E"
	Price         int64          `gorm:"not null;index" json:"price"`     // Exact price in Satang
	ComparePrice  int64          `json:"compare_price"`                   // Strikethrough price in Satang (optional)
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
