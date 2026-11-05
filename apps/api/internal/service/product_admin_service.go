package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// ValidationError lists every problem with an input, keyed by field path (e.g. "variants.1.sku").
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%d field(s) need attention", len(e.Fields))
}

type ProductAdminService interface {
	ListProducts(ctx context.Context, filter dto.AdminProductListFilter) ([]dto.AdminProductSummary, int64, error)
	GetProduct(ctx context.Context, id uuid.UUID) (*models.Product, error)
	CreateProduct(ctx context.Context, in dto.ProductInput, actor repository.Actor) (*models.Product, error)
	UpdateProduct(ctx context.Context, id uuid.UUID, in dto.ProductInput, actor repository.Actor) (*models.Product, error)
	SetActive(ctx context.Context, id uuid.UUID, active bool) error
	AdjustStock(ctx context.Context, variantID uuid.UUID, req dto.StockAdjustmentRequest, actor repository.Actor) (*dto.StockAdjustmentResponse, error)
	ListMovements(ctx context.Context, variantID uuid.UUID) ([]models.StockMovement, error)
}

type productAdminService struct {
	repo repository.ProductAdminRepository
}

func NewProductAdminService(repo repository.ProductAdminRepository) ProductAdminService {
	return &productAdminService{repo: repo}
}

var (
	slugPattern  = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	skuPattern   = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]{1,63}$`)
	hexPattern   = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
	slugReplacer = regexp.MustCompile(`[^a-z0-9]+`)
)

var knownPersonas = map[string]bool{"CREATOR": true, "GAMING": true, "ULTRALIGHT": true, "OFFICE": true}

const (
	maxVariants         = 50
	maxImagesPerVariant = 10
	maxStockPerChange   = 100000
	maxPriceSatang      = 100_000_000_00 // ฿100,000,000
	maxContentBytes     = 64 * 1024
)

// Slugify turns a product name into a URL slug ("MacBook Air 13\"" -> "macbook-air-13").
func Slugify(name string) string {
	s := slugReplacer.ReplaceAllString(strings.ToLower(name), "-")
	s = strings.Trim(s, "-")
	if len(s) > 120 {
		s = strings.Trim(s[:120], "-")
	}
	return s
}

func (s *productAdminService) ListProducts(ctx context.Context, f dto.AdminProductListFilter) ([]dto.AdminProductSummary, int64, error) {
	return s.repo.ListProducts(ctx, f)
}

func (s *productAdminService) GetProduct(ctx context.Context, id uuid.UUID) (*models.Product, error) {
	return s.repo.GetProduct(ctx, id)
}

func (s *productAdminService) CreateProduct(ctx context.Context, in dto.ProductInput, actor repository.Actor) (*models.Product, error) {
	product, stock, err := s.build(ctx, in, nil)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateProduct(ctx, product, stock, actor); err != nil {
		return nil, err
	}
	return s.repo.GetProduct(ctx, product.ID)
}

func (s *productAdminService) UpdateProduct(ctx context.Context, id uuid.UUID, in dto.ProductInput, actor repository.Actor) (*models.Product, error) {
	if _, err := s.repo.GetProduct(ctx, id); err != nil {
		return nil, err
	}
	product, stock, err := s.build(ctx, in, &id)
	if err != nil {
		return nil, err
	}
	product.ID = id
	if err := s.repo.UpdateProduct(ctx, product, stock, actor); err != nil {
		return nil, err
	}
	return s.repo.GetProduct(ctx, id)
}

func (s *productAdminService) SetActive(ctx context.Context, id uuid.UUID, active bool) error {
	return s.repo.SetActive(ctx, id, active)
}

func (s *productAdminService) AdjustStock(ctx context.Context, variantID uuid.UUID, req dto.StockAdjustmentRequest, actor repository.Actor) (*dto.StockAdjustmentResponse, error) {
	fields := map[string]string{}
	req.Mode = strings.ToLower(strings.TrimSpace(req.Mode))
	req.Reason = strings.ToUpper(strings.TrimSpace(req.Reason))
	req.Note = strings.TrimSpace(req.Note)
	switch req.Mode {
	case "delta":
		if req.Quantity == 0 {
			fields["quantity"] = "Enter how many units to add or remove."
		}
	case "set":
		if req.Quantity < 0 {
			fields["quantity"] = "Counted stock cannot be negative."
		}
	default:
		fields["mode"] = `Choose "delta" or "set".`
	}
	if abs(req.Quantity) > maxStockPerChange {
		fields["quantity"] = fmt.Sprintf("At most %d units per change.", maxStockPerChange)
	}
	allowed := false
	for _, r := range models.AdminStockReasons {
		allowed = allowed || r == req.Reason
	}
	if !allowed {
		fields["reason"] = "Choose a reason: " + strings.Join(models.AdminStockReasons, ", ") + "."
	}
	if (req.Reason == models.StockReasonDamage || req.Reason == models.StockReasonCount) && req.Note == "" {
		fields["note"] = "Add a short note for write-offs and count corrections."
	}
	if utf8.RuneCountInString(req.Note) > 500 {
		fields["note"] = "Keep the note under 500 characters."
	}
	if len(fields) > 0 {
		return nil, &ValidationError{Fields: fields}
	}
	return s.repo.AdjustStock(ctx, variantID, req, actor)
}

func (s *productAdminService) ListMovements(ctx context.Context, variantID uuid.UUID) ([]models.StockMovement, error) {
	return s.repo.ListMovements(ctx, variantID, 50)
}

// build validates the input and turns it into a product with variants, plus each variant's
// opening stock. productID is set when updating, to exclude the product's own slug and SKUs.
func (s *productAdminService) build(ctx context.Context, in dto.ProductInput, productID *uuid.UUID) (*models.Product, []int, error) {
	fields := map[string]string{}
	bad := func(key, msg string) {
		if _, seen := fields[key]; !seen {
			fields[key] = msg
		}
	}

	name := strings.TrimSpace(in.Name)
	if n := utf8.RuneCountInString(name); n < 2 || n > 200 {
		bad("name", "Name must be 2–200 characters.")
	}
	slug := strings.TrimSpace(strings.ToLower(in.Slug))
	if slug == "" {
		slug = Slugify(name)
	}
	if !slugPattern.MatchString(slug) || len(slug) > 120 {
		bad("slug", "Use lowercase letters, numbers and single hyphens (e.g. macbook-air-13).")
	} else if taken, err := s.repo.SlugTaken(ctx, slug, productID); err != nil {
		return nil, nil, err
	} else if taken {
		bad("slug", "Another product already uses this URL.")
	}

	if in.CategoryID == uuid.Nil {
		bad("category_id", "Choose a category.")
	} else if ok, err := s.repo.CategoryExists(ctx, in.CategoryID); err != nil {
		return nil, nil, err
	} else if !ok {
		bad("category_id", "That category no longer exists.")
	}
	if in.BrandID == uuid.Nil {
		bad("brand_id", "Choose a brand.")
	} else if ok, err := s.repo.BrandExists(ctx, in.BrandID); err != nil {
		return nil, nil, err
	} else if !ok {
		bad("brand_id", "That brand no longer exists.")
	}

	tagline, short := strings.TrimSpace(in.Tagline), strings.TrimSpace(in.ShortDescription)
	if utf8.RuneCountInString(tagline) > 200 {
		bad("tagline", "Keep the tagline under 200 characters.")
	}
	if utf8.RuneCountInString(short) > 1000 {
		bad("short_description", "Keep the description under 1,000 characters.")
	}

	personas := []string{}
	seenPersona := map[string]bool{}
	for _, p := range in.UsagePersonas {
		p = strings.ToUpper(strings.TrimSpace(p))
		if !knownPersonas[p] {
			bad("usage_personas", "Unknown use case: "+p)
			continue
		}
		if !seenPersona[p] {
			seenPersona[p] = true
			personas = append(personas, p)
		}
	}

	content := func(key string, raw json.RawMessage, wantArray bool, empty string) datatypes.JSON {
		raw = bytes.TrimSpace(raw)
		if len(raw) == 0 || string(raw) == "null" {
			return datatypes.JSON(empty)
		}
		if len(raw) > maxContentBytes {
			bad(key, "This section is too large.")
			return datatypes.JSON(empty)
		}
		var v interface{}
		if err := json.Unmarshal(raw, &v); err != nil {
			bad(key, "This section is not valid.")
			return datatypes.JSON(empty)
		}
		if _, isArr := v.([]interface{}); wantArray != isArr {
			bad(key, "This section has the wrong shape.")
			return datatypes.JSON(empty)
		}
		return datatypes.JSON(raw)
	}
	highlights := content("bento_highlights", in.BentoHighlights, true, "[]")
	box := content("box_contents", in.BoxContents, true, "[]")
	ports := content("ports_diagram", in.PortsDiagram, false, `{"left_ports":[],"right_ports":[]}`)
	matrix := content("full_spec_matrix", in.FullSpecMatrix, true, "[]")

	if len(in.Variants) == 0 {
		bad("variants", "Add at least one variant.")
	}
	if len(in.Variants) > maxVariants {
		bad("variants", fmt.Sprintf("At most %d variants per product.", maxVariants))
	}

	variants := make([]models.ProductVariant, 0, len(in.Variants))
	stock := make([]int, 0, len(in.Variants))
	skus := []string{}
	skuIndex := map[string]int{}
	var minPrice int64 = math.MaxInt64
	for i, v := range in.Variants {
		key := func(f string) string { return fmt.Sprintf("variants.%d.%s", i, f) }
		sku := strings.ToUpper(strings.TrimSpace(v.SKU))
		if !skuPattern.MatchString(sku) {
			bad(key("sku"), "SKU: 2–64 letters, numbers or hyphens.")
		} else if j, dup := skuIndex[sku]; dup {
			bad(key("sku"), fmt.Sprintf("Same SKU as variant %d.", j+1))
		} else {
			skuIndex[sku] = i
			skus = append(skus, sku)
		}
		color := strings.TrimSpace(v.ColorName)
		if color == "" || utf8.RuneCountInString(color) > 50 {
			bad(key("color_name"), "Colour name is required (max 50).")
		}
		hex := strings.ToUpper(strings.TrimSpace(v.ColorHex))
		if !hexPattern.MatchString(hex) {
			bad(key("color_hex"), "Use a hex colour like #2E2C2E.")
		}
		if v.Price <= 0 || v.Price > maxPriceSatang {
			bad(key("price"), "Price must be more than ฿0.")
		}
		if v.ComparePrice != 0 && v.ComparePrice <= v.Price {
			bad(key("compare_price"), "Compare-at price must be higher than the price, or empty.")
		}
		specs, specErr := normalizeSpecs(v.Specs)
		if specErr != "" {
			bad(key("specs"), specErr)
		}
		images := []string{}
		for _, img := range v.Images {
			img = strings.TrimSpace(img)
			if img == "" {
				continue
			}
			if u, err := url.Parse(img); err != nil || (u.Scheme != "http" && u.Scheme != "https") || len(img) > 500 {
				bad(key("images"), "Images must be uploaded files or http(s) links.")
				continue
			}
			images = append(images, img)
		}
		if len(images) > maxImagesPerVariant {
			bad(key("images"), fmt.Sprintf("At most %d images per variant.", maxImagesPerVariant))
		}
		opening := 0
		if v.ID == nil {
			if v.InitialStock < 0 || v.InitialStock > maxStockPerChange {
				bad(key("initial_stock"), "Opening stock must be 0 or more.")
			} else {
				opening = v.InitialStock
			}
		}

		specJSON, _ := json.Marshal(specs)
		imageJSON, _ := json.Marshal(images)
		mv := models.ProductVariant{
			SKU: sku, ColorName: color, ColorHex: hex, Price: v.Price, ComparePrice: v.ComparePrice,
			Specs: datatypes.JSON(specJSON), Images: datatypes.JSON(imageJSON),
		}
		if v.ID != nil {
			mv.ID = *v.ID
		}
		variants = append(variants, mv)
		stock = append(stock, opening)
		if v.Price > 0 && v.Price < minPrice {
			minPrice = v.Price
		}
	}

	if taken, err := s.repo.SKUsTaken(ctx, skus, productID); err != nil {
		return nil, nil, err
	} else {
		for _, sku := range taken {
			bad(fmt.Sprintf("variants.%d.sku", skuIndex[sku]), "Another product already uses this SKU.")
		}
	}

	if len(fields) > 0 {
		return nil, nil, &ValidationError{Fields: fields}
	}

	personaJSON, _ := json.Marshal(personas)
	return &models.Product{
		Slug: slug, Name: name, CategoryID: in.CategoryID, BrandID: in.BrandID,
		Tagline: tagline, ShortDescription: short, BasePrice: minPrice,
		UsagePersonas: datatypes.JSON(personaJSON), BentoHighlights: highlights, BoxContents: box,
		PortsDiagram: ports, FullSpecMatrix: matrix, IsActive: in.IsActive, Variants: variants,
	}, stock, nil
}

// normalizeSpecs keeps the spec map, coercing the filterable fields: ram_gb and storage_gb
// become non-negative whole numbers and cpu_family a trimmed string. Other keys pass through.
func normalizeSpecs(in map[string]interface{}) (map[string]interface{}, string) {
	out := map[string]interface{}{}
	for k, v := range in {
		out[k] = v
	}
	for _, k := range []string{"ram_gb", "storage_gb"} {
		raw, ok := out[k]
		if !ok || raw == nil || raw == "" {
			out[k] = 0
			continue
		}
		f, isNum := raw.(float64)
		if !isNum || f < 0 || f != math.Trunc(f) || f > 1_000_000 {
			return nil, k + " must be a whole number of GB."
		}
		out[k] = int(f)
	}
	if cpu, ok := out["cpu_family"]; ok {
		str, isStr := cpu.(string)
		if !isStr || utf8.RuneCountInString(str) > 80 {
			return nil, "cpu_family must be text (max 80)."
		}
		out["cpu_family"] = strings.TrimSpace(str)
	}
	return out, ""
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
