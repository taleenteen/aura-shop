package service

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

// MerchandisingService manages home-page banners, categories and brands.
type MerchandisingService interface {
	ListBanners(ctx context.Context) ([]models.Banner, error)
	CreateBanner(ctx context.Context, in dto.BannerInput) (*models.Banner, error)
	UpdateBanner(ctx context.Context, id uuid.UUID, in dto.BannerInput) (*models.Banner, error)
	SetBannerActive(ctx context.Context, id uuid.UUID, active bool) error
	DeleteBanner(ctx context.Context, id uuid.UUID) error

	ListCategories(ctx context.Context) ([]dto.AdminCategory, error)
	SaveCategory(ctx context.Context, id *uuid.UUID, in dto.CategoryInput) (*models.Category, error)
	DeleteCategory(ctx context.Context, id uuid.UUID) error

	ListBrands(ctx context.Context) ([]dto.AdminBrand, error)
	SaveBrand(ctx context.Context, id *uuid.UUID, in dto.BrandInput) (*models.Brand, error)
	DeleteBrand(ctx context.Context, id uuid.UUID) error
}

type merchandisingService struct {
	repo repository.MerchandisingRepository
}

func NewMerchandisingService(repo repository.MerchandisingRepository) MerchandisingService {
	return &merchandisingService{repo: repo}
}

var (
	bannerPlacements = map[string]bool{"HERO_SPLIT": true, "BENTO_GRID": true, "TOP_RIBBON": true}
	bannerThemes     = map[string]bool{"DARK": true, "LIGHT": true}
	iconPattern      = regexp.MustCompile(`^[A-Za-z0-9]*$`)
	// bentoGridSpans are the tile sizes of the home-page promo grid (Tailwind classes).
	bentoGridSpans = map[string]bool{
		"col-span-1 md:col-span-2 md:row-span-2": true, // large
		"col-span-1 md:col-span-2 md:row-span-1": true, // wide
		"col-span-1 md:col-span-1 md:row-span-1": true, // standard
	}
)

func tooLong(s string, max int) bool { return utf8.RuneCountInString(s) > max }

// validLink accepts a site path ("/catalog?category=mac") or an absolute http(s) URL.
func validLink(s string) bool {
	if strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "//") {
		return true
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func buildBanner(in dto.BannerInput) (*models.Banner, error) {
	f := map[string]string{}
	b := &models.Banner{
		Placement:        strings.ToUpper(strings.TrimSpace(in.Placement)),
		ThemeMode:        strings.ToUpper(strings.TrimSpace(in.ThemeMode)),
		BackgroundColor:  strings.TrimSpace(in.BackgroundColor),
		BadgeText:        strings.TrimSpace(in.BadgeText),
		Headline:         strings.TrimSpace(in.Headline),
		Subheadline:      strings.TrimSpace(in.Subheadline),
		ProductImageURL:  strings.TrimSpace(in.ProductImageURL),
		CTAPrimaryText:   strings.TrimSpace(in.CTAPrimaryText),
		CTAPrimaryLink:   strings.TrimSpace(in.CTAPrimaryLink),
		CTASecondaryText: strings.TrimSpace(in.CTASecondaryText),
		CTASecondaryLink: strings.TrimSpace(in.CTASecondaryLink),
		SortOrder:        in.SortOrder,
		IsActive:         in.IsActive,
		StartAt:          in.StartAt,
		EndAt:            in.EndAt,
	}
	b.GridSpan = strings.TrimSpace(in.GridSpan)
	ribbon := b.Placement == "TOP_RIBBON"
	if b.Placement == "BENTO_GRID" {
		if b.GridSpan == "" {
			b.GridSpan = "col-span-1 md:col-span-1 md:row-span-1"
		} else if !bentoGridSpans[b.GridSpan] {
			f["grid_span"] = "Choose a tile size."
		}
	} else {
		b.GridSpan = "col-span-1"
	}

	if !bannerPlacements[b.Placement] {
		f["placement"] = "Choose where the banner appears."
	}
	if b.ThemeMode == "" {
		b.ThemeMode = "DARK"
	} else if !bannerThemes[b.ThemeMode] {
		f["theme_mode"] = "Choose dark or light text."
	}
	switch {
	case b.Headline == "":
		f["headline"] = "Enter a headline."
	case tooLong(b.Headline, 140):
		f["headline"] = "Keep the headline under 140 characters."
	}
	if tooLong(b.BadgeText, 40) {
		f["badge_text"] = "Keep the badge under 40 characters."
	}
	if tooLong(b.Subheadline, 300) {
		f["subheadline"] = "Keep the subheadline under 300 characters."
	}
	if b.BackgroundColor == "" {
		b.BackgroundColor = "#09090B"
	} else if tooLong(b.BackgroundColor, 200) || strings.ContainsAny(b.BackgroundColor, ";{}<>") {
		f["background_color"] = "Use a colour such as #09090B or a CSS gradient."
	}

	if !ribbon {
		if b.ProductImageURL == "" {
			f["product_image_url"] = "Upload or link a product image."
		} else if !validLink(b.ProductImageURL) {
			f["product_image_url"] = "Use an uploaded image or an https:// link."
		}
		if b.CTAPrimaryText == "" {
			b.CTAPrimaryText = "Shop Now"
		}
		if b.CTAPrimaryLink == "" {
			f["cta_primary_link"] = "Where should the button go? e.g. /catalog?category=mac"
		}
	}
	if b.CTAPrimaryLink != "" && !validLink(b.CTAPrimaryLink) {
		f["cta_primary_link"] = "Use a site path like /catalog or an https:// link."
	}
	if tooLong(b.CTAPrimaryText, 40) {
		f["cta_primary_text"] = "Keep the button text under 40 characters."
	}
	if b.CTASecondaryLink != "" && !validLink(b.CTASecondaryLink) {
		f["cta_secondary_link"] = "Use a site path like /catalog or an https:// link."
	}
	if b.CTASecondaryText != "" && b.CTASecondaryLink == "" {
		f["cta_secondary_link"] = "Add a link for the second button."
	}

	switch {
	case b.StartAt.IsZero():
		f["start_at"] = "Choose when the banner starts."
	case b.EndAt.IsZero():
		f["end_at"] = "Choose when the banner ends."
	case !b.EndAt.After(b.StartAt):
		f["end_at"] = "The end must be after the start."
	}

	if len(f) > 0 {
		return nil, &ValidationError{Fields: f}
	}
	if ribbon {
		b.ProductImageURL = "" // the ribbon is text only
	}
	return b, nil
}

func (s *merchandisingService) ListBanners(ctx context.Context) ([]models.Banner, error) {
	banners, err := s.repo.ListBanners(ctx)
	if banners == nil && err == nil {
		banners = []models.Banner{}
	}
	return banners, err
}

func (s *merchandisingService) CreateBanner(ctx context.Context, in dto.BannerInput) (*models.Banner, error) {
	b, err := buildBanner(in)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SaveBanner(ctx, b); err != nil {
		return nil, err
	}
	return b, nil
}

func (s *merchandisingService) UpdateBanner(ctx context.Context, id uuid.UUID, in dto.BannerInput) (*models.Banner, error) {
	existing, err := s.repo.GetBanner(ctx, id)
	if err != nil {
		return nil, err
	}
	b, err := buildBanner(in)
	if err != nil {
		return nil, err
	}
	b.ID, b.CreatedAt = existing.ID, existing.CreatedAt
	if err := s.repo.SaveBanner(ctx, b); err != nil {
		return nil, err
	}
	return b, nil
}

func (s *merchandisingService) SetBannerActive(ctx context.Context, id uuid.UUID, active bool) error {
	return s.repo.SetBannerActive(ctx, id, active)
}

func (s *merchandisingService) DeleteBanner(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteBanner(ctx, id)
}

// normalizeSlug trims and lowercases a given slug, or derives one from the name when empty.
func normalizeSlug(slug, name string, f map[string]string) string {
	s := strings.ToLower(strings.TrimSpace(slug))
	if s == "" {
		s = Slugify(name)
	}
	if s != "" && (!slugPattern.MatchString(s) || len(s) > 60) {
		f["slug"] = "Use lowercase letters, digits and dashes (max 60)."
	}
	return s
}

func slugTaken(err error) error {
	if errors.Is(err, repository.ErrSlugTaken) {
		return &ValidationError{Fields: map[string]string{"slug": "Another entry already uses this slug."}}
	}
	return err
}

func (s *merchandisingService) ListCategories(ctx context.Context) ([]dto.AdminCategory, error) {
	rows, err := s.repo.ListCategoriesWithCounts(ctx)
	if rows == nil && err == nil {
		rows = []dto.AdminCategory{}
	}
	return rows, err
}

func (s *merchandisingService) SaveCategory(ctx context.Context, id *uuid.UUID, in dto.CategoryInput) (*models.Category, error) {
	f := map[string]string{}
	c := &models.Category{
		Name:      strings.TrimSpace(in.Name),
		NavLabel:  strings.TrimSpace(in.NavLabel),
		IconName:  strings.TrimSpace(in.IconName),
		SortOrder: in.SortOrder,
	}
	switch {
	case c.Name == "":
		f["name"] = "Enter a name."
	case tooLong(c.Name, 60):
		f["name"] = "Keep the name under 60 characters."
	}
	if tooLong(c.NavLabel, 20) {
		f["nav_label"] = "Keep the menu label under 20 characters."
	}
	if !iconPattern.MatchString(c.IconName) || tooLong(c.IconName, 40) {
		f["icon_name"] = "Use an icon name such as Laptop or Monitor."
	}
	c.Slug = normalizeSlug(in.Slug, c.Name, f)
	if len(f) > 0 {
		return nil, &ValidationError{Fields: f}
	}
	if id != nil {
		if _, err := s.repo.GetCategory(ctx, *id); err != nil {
			return nil, err
		}
		c.ID = *id
	}
	if err := s.repo.SaveCategory(ctx, c); err != nil {
		return nil, slugTaken(err)
	}
	return c, nil
}

func (s *merchandisingService) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteCategory(ctx, id)
}

func (s *merchandisingService) ListBrands(ctx context.Context) ([]dto.AdminBrand, error) {
	rows, err := s.repo.ListBrandsWithCounts(ctx)
	if rows == nil && err == nil {
		rows = []dto.AdminBrand{}
	}
	return rows, err
}

func (s *merchandisingService) SaveBrand(ctx context.Context, id *uuid.UUID, in dto.BrandInput) (*models.Brand, error) {
	f := map[string]string{}
	b := &models.Brand{Name: strings.TrimSpace(in.Name), LogoURL: strings.TrimSpace(in.LogoURL)}
	switch {
	case b.Name == "":
		f["name"] = "Enter a name."
	case tooLong(b.Name, 60):
		f["name"] = "Keep the name under 60 characters."
	}
	if b.LogoURL != "" && !validLink(b.LogoURL) {
		f["logo_url"] = "Use an uploaded image or an https:// link."
	}
	b.Slug = normalizeSlug(in.Slug, b.Name, f)
	if len(f) > 0 {
		return nil, &ValidationError{Fields: f}
	}
	if id != nil {
		if _, err := s.repo.GetBrand(ctx, *id); err != nil {
			return nil, err
		}
		b.ID = *id
	}
	if err := s.repo.SaveBrand(ctx, b); err != nil {
		return nil, slugTaken(err)
	}
	return b, nil
}

func (s *merchandisingService) DeleteBrand(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteBrand(ctx, id)
}
