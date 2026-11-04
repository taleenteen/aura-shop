package models

import (
	"time"

	"github.com/google/uuid"
)

// Component-Driven Dynamic Banner (Replaces flat unreadable image banners)
type Banner struct {
	ID               uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Placement        string    `gorm:"index;not null" json:"placement"`                  // HERO_SPLIT (60%), BENTO_GRID (30%), TOP_RIBBON (10%)
	GridSpan         string    `gorm:"default:'col-span-1 row-span-1'" json:"grid_span"` // e.g., "col-span-2 row-span-2"
	ThemeMode        string    `gorm:"default:'DARK'" json:"theme_mode"`                 // DARK (white text), LIGHT (dark text)
	BackgroundColor  string    `gorm:"not null" json:"background_color"`                 // Hex or CSS radial/linear-gradient
	BadgeText        string    `json:"badge_text"`                                       // e.g., "NEW RELEASE", "0% 10 MONTHS"
	Headline         string    `gorm:"not null" json:"headline"`                         // e.g., "MacBook Pro 14 with M4 Pro"
	Subheadline      string    `json:"subheadline"`                                      // e.g., "Mind-blowing performance. Up to 24 hrs battery."
	ProductImageURL  string    `gorm:"not null" json:"product_image_url"`                // Transparent PNG/WebP product cutout
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
