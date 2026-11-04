package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"aura-tech/api/internal/config"
	"aura-tech/api/internal/database"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/storage"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type TrackedItem struct {
	ID          string // SKU or Banner Identifier
	Type        string // "PRODUCT_VARIANT" or "BANNER"
	ProductSlug string
	Name        string
	ColorName   string
	CurrentURL  string
	TargetMinIO string
	Status      string // "MISSING", "WHITE_BG", "OK"
	Prompt      string
	IsLight     bool
	VariantID   *uuid.UUID
	BannerID    *uuid.UUID
}

func main() {
	mode := flag.String("mode", "audit", "Execution mode: 'audit' or 'generate'")
	skuFilter := flag.String("sku", "", "Optional SKU or Banner ID filter for generation")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	slog.Info("starting assetgen tool", "mode", *mode, "sku", *skuFilter)

	db, err := database.ConnectPostgres(cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to postgres", "error", err)
		os.Exit(1)
	}

	minioClient, err := storage.NewMinIOClient(
		cfg.MinIOEndpoint,
		cfg.MinIORootUser,
		cfg.MinIORootPassword,
		cfg.MinIOBucketName,
		cfg.MinIOPublicURL,
		cfg.MinIOUseSSL,
	)
	if err != nil {
		slog.Error("failed to initialize minio client", "error", err)
		os.Exit(1)
	}

	items, err := loadAllTrackedItems(db)
	if err != nil {
		slog.Error("failed to load items from database", "error", err)
		os.Exit(1)
	}

	slog.Info("loaded items for audit/generation", "total", len(items))

	switch *mode {
	case "audit":
		runAudit(context.Background(), db, minioClient, items)
	case "generate":
		apiKey := os.Getenv("GEMINI_API_KEY")
		if apiKey == "" {
			slog.Error("GEMINI_API_KEY environment variable is required for --mode=generate")
			os.Exit(1)
		}
		runGenerate(context.Background(), db, minioClient, items, apiKey, *skuFilter)
	default:
		slog.Error("unknown mode, must be 'audit' or 'generate'", "mode", *mode)
		os.Exit(1)
	}
}

func loadAllTrackedItems(db *gorm.DB) ([]TrackedItem, error) {
	var products []models.Product
	if err := db.Preload("Variants").Find(&products).Error; err != nil {
		return nil, fmt.Errorf("failed to query products: %w", err)
	}

	var items []TrackedItem

	for _, p := range products {
		for _, v := range p.Variants {
			var images []string
			if len(v.Images) > 0 {
				_ = json.Unmarshal(v.Images, &images)
			}
			currURL := ""
			if len(images) > 0 {
				currURL = images[0]
			}

			targetPath := fmt.Sprintf("products/%s/%s.png", p.Slug, v.SKU)
			prompt, isLight := buildTailoredPrompt(p.Slug, v.SKU, p.Name, v.ColorName)

			variantID := v.ID
			items = append(items, TrackedItem{
				ID:          v.SKU,
				Type:        "PRODUCT_VARIANT",
				ProductSlug: p.Slug,
				Name:        fmt.Sprintf("%s (%s)", p.Name, v.ColorName),
				ColorName:   v.ColorName,
				CurrentURL:  currURL,
				TargetMinIO: targetPath,
				Status:      "MISSING",
				Prompt:      prompt,
				IsLight:     isLight,
				VariantID:   &variantID,
			})
		}
	}

	var banners []models.Banner
	if err := db.Find(&banners).Error; err != nil {
		return nil, fmt.Errorf("failed to query banners: %w", err)
	}

	for _, b := range banners {
		// Skip banners without a product cutout image (e.g. text-only top ribbon)
		if b.Placement == "TOP_RIBBON" && b.ProductImageURL == "" {
			continue
		}

		bannerIDSlug := sanitizeBannerID(b.Headline)
		targetPath := fmt.Sprintf("banners/%s.png", bannerIDSlug)
		prompt, isLight := buildBannerPrompt(b.Placement, b.Headline, b.Subheadline)

		bannerID := b.ID
		items = append(items, TrackedItem{
			ID:          fmt.Sprintf("BANNER-%s", strings.ToUpper(bannerIDSlug)),
			Type:        "BANNER",
			ProductSlug: bannerIDSlug,
			Name:        fmt.Sprintf("Banner: %s", b.Headline),
			ColorName:   b.ThemeMode,
			CurrentURL:  b.ProductImageURL,
			TargetMinIO: targetPath,
			Status:      "MISSING",
			Prompt:      prompt,
			IsLight:     isLight,
			BannerID:    &bannerID,
		})
	}

	return items, nil
}

func sanitizeBannerID(headline string) string {
	lower := strings.ToLower(headline)
	var sb strings.Builder
	for _, r := range lower {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		} else if sb.Len() > 0 && sb.String()[sb.Len()-1] != '-' {
			sb.WriteRune('-')
		}
	}
	res := strings.Trim(sb.String(), "-")
	if len(res) > 30 {
		res = res[:30]
	}
	if res == "" {
		res = "promo-banner"
	}
	return res
}

func isLightFinish(colorName string) bool {
	lower := strings.ToLower(colorName)
	return strings.Contains(lower, "white") ||
		strings.Contains(lower, "silver") ||
		strings.Contains(lower, "starlight") ||
		strings.Contains(lower, "luna grey") ||
		strings.Contains(lower, "platinum")
}

func buildTailoredPrompt(slug, sku, productName, colorName string) (string, bool) {
	light := isLightFinish(colorName)
	edgeConstraint := "no cast shadows on edges"
	if light {
		edgeConstraint = "subtle studio rim contrast on outer chassis edges against a flat pure #FFFFFF background, no drop shadow"
	}

	var prompt string
	switch {
	case strings.Contains(slug, "macbook-pro"):
		prompt = fmt.Sprintf("Apple MacBook Pro 14-inch in %s aluminum finish, open at 110 degree angle showing Liquid Retina XDR display with thin bezels, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, %s, ultra-sharp 8k commercial render", colorName, edgeConstraint)
	case strings.Contains(slug, "macbook-air"):
		prompt = fmt.Sprintf("Apple MacBook Air 13-inch in %s anodized aluminum finish, open at 115 degree angle displaying macOS desktop, sleek ultra-thin wedge design, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, %s, ultra-sharp 8k commercial render", colorName, edgeConstraint)
	case strings.Contains(slug, "asus-rog") || strings.Contains(slug, "zephyrus"):
		prompt = fmt.Sprintf("ASUS ROG Zephyrus G16 (2024) gaming laptop in %s CNC aluminum chassis with Slash Lighting on lid, 240Hz ROG Nebula OLED display, premium gaming aesthetic, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, %s, ultra-sharp 8k commercial render", colorName, edgeConstraint)
	case strings.Contains(slug, "yoga-slim") || strings.Contains(slug, "lenovo"):
		prompt = fmt.Sprintf("Lenovo Yoga Slim 7i Aura Edition 15-inch ultrabook in %s premium aluminum chassis, PureSight Pro display with slim bezels, sleek modern productivity aesthetic, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, %s, ultra-sharp 8k commercial render", colorName, edgeConstraint)
	case strings.Contains(slug, "ultrafine") || strings.Contains(slug, "lg"):
		prompt = "LG UltraFine 27-inch 5K monitor on sleek minimalist black metal stand, matte black finish, clean front view with ultra-vibrant 5K display panel, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, no cast shadows on edges, ultra-sharp 8k commercial render"
	case strings.Contains(slug, "keychron"):
		prompt = fmt.Sprintf("Keychron Q1 Pro 75%% custom mechanical keyboard in %s CNC machined aluminum body, KSA profile PBT keycaps with accent keys, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, %s, ultra-sharp 8k commercial render", colorName, edgeConstraint)
	default:
		prompt = fmt.Sprintf("High-end electronics gadget %s in %s, floating studio product photography, centered, completely isolated on a pure solid flat white #FFFFFF background, %s, ultra-sharp 8k commercial render", productName, colorName, edgeConstraint)
	}

	return prompt, light
}

func buildBannerPrompt(placement, headline, subheadline string) (string, bool) {
	switch {
	case strings.Contains(strings.ToLower(headline), "macbook pro"):
		return "Apple MacBook Pro 14-inch Space Black M4 Pro flagship hero display, premium cinematic floating studio angle, isolated on pure solid flat white #FFFFFF background, no cast shadows, ultra-sharp 8k commercial render", false
	case strings.Contains(strings.ToLower(headline), "rog"):
		return "ASUS ROG Zephyrus G16 OLED gaming laptop dramatic studio presentation, Slash Lighting, isolated on pure solid flat white #FFFFFF background, no cast shadows, ultra-sharp 8k commercial render", false
	case strings.Contains(strings.ToLower(headline), "university") || strings.Contains(strings.ToLower(headline), "student"):
		return "Apple MacBook Air 13-inch in Midnight open alongside white AirPods on a pristine surface, isolated on pure solid flat white #FFFFFF background, subtle studio rim contrast, ultra-sharp 8k commercial render", true
	default:
		return fmt.Sprintf("Premium flagship tech banner product render for %s, floating studio photography isolated on pure flat white background, 8k commercial render", headline), false
	}
}

func newRobustHTTPClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: 25 * time.Second,
	}
}

func downloadSourceImage(ctx context.Context, client *http.Client, rawURL string) (image.Image, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	if strings.Contains(rawURL, "asus.com") {
		req.Header.Set("Referer", "https://rog.asus.com/")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected HTTP status %d from %s", resp.StatusCode, rawURL)
	}
	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to decode image from %s: %w", rawURL, err)
	}
	return img, nil
}

func runAudit(ctx context.Context, db *gorm.DB, minioClient *storage.MinIOClient, items []TrackedItem) {
	slog.Info("starting asset audit...")

	httpClient := newRobustHTTPClient()
	var totalImages, okTransparent, brokenMissing, hasWhiteBG int

	for i := range items {
		item := &items[i]
		slog.Info("auditing item", "id", item.ID, "current_url", item.CurrentURL, "target_minio", item.TargetMinIO)

		// 1. Check if MinIO already has the target transparent asset
		stat, err := minioClient.Client().StatObject(ctx, minioClient.Bucket(), item.TargetMinIO, minio.StatObjectOptions{})
		if err == nil && stat.Size > 0 {
			obj, getErr := minioClient.Client().GetObject(ctx, minioClient.Bucket(), item.TargetMinIO, minio.GetObjectOptions{})
			if getErr == nil {
				img, _, decErr := image.Decode(obj)
				_ = obj.Close()
				if decErr == nil && hasTransparentCorners(img) {
					item.Status = "OK"
					okTransparent++
					totalImages++
					continue
				}
			}
		}

		// 2. If not yet in MinIO or not transparent in MinIO, inspect CurrentURL
		if item.CurrentURL == "" {
			item.Status = "MISSING"
			brokenMissing++
			totalImages++
			continue
		}

		// Try downloading current image URL with robust headers
		img, err := downloadSourceImage(ctx, httpClient, item.CurrentURL)
		if err != nil {
			slog.Warn("failed to fetch current URL", "id", item.ID, "url", item.CurrentURL, "error", err)
			item.Status = "MISSING"
			brokenMissing++
			totalImages++
			continue
		}

		// Check corner pixels for opaque white background
		if hasOpaqueWhiteCorners(img) {
			item.Status = "WHITE_BG"
			hasWhiteBG++
		} else if hasTransparentCorners(img) && strings.Contains(item.CurrentURL, "aura-assets") {
			item.Status = "OK"
			okTransparent++
		} else {
			// External URL even if transparent or non-white must be migrated to MinIO
			item.Status = "WHITE_BG"
			hasWhiteBG++
		}
		totalImages++
	}

	slog.Info("audit completed",
		"total", totalImages,
		"ok_transparent", okTransparent,
		"white_bg", hasWhiteBG,
		"missing_broken", brokenMissing,
	)

	fmt.Println("==================================================")
	fmt.Println("             ASSET AUDIT SUMMARY                  ")
	fmt.Println("==================================================")
	fmt.Printf("Total Images Audited : %d\n", totalImages)
	fmt.Printf("OK Transparent (MinIO): %d\n", okTransparent)
	fmt.Printf("Has White Background : %d\n", hasWhiteBG)
	fmt.Printf("Broken / 404 / Missing: %d\n", brokenMissing)
	fmt.Println("==================================================")

	if err := writeTrackerMarkdown(items, totalImages, okTransparent, hasWhiteBG, brokenMissing); err != nil {
		slog.Error("failed to write IMAGE_GEN_TRACKER.md", "error", err)
	} else {
		slog.Info("successfully updated IMAGE_GEN_TRACKER.md")
	}
}

func hasTransparentCorners(img image.Image) bool {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w == 0 || h == 0 {
		return false
	}

	corners := [][2]int{
		{bounds.Min.X, bounds.Min.Y},
		{bounds.Min.X + w - 1, bounds.Min.Y},
		{bounds.Min.X, bounds.Min.Y + h - 1},
		{bounds.Min.X + w - 1, bounds.Min.Y + h - 1},
	}

	for _, pt := range corners {
		_, _, _, a := img.At(pt[0], pt[1]).RGBA()
		if (a >> 8) < 50 {
			return true
		}
	}
	return false
}

func hasOpaqueWhiteCorners(img image.Image) bool {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w == 0 || h == 0 {
		return false
	}

	corners := [][2]int{
		{bounds.Min.X, bounds.Min.Y},
		{bounds.Min.X + w - 1, bounds.Min.Y},
		{bounds.Min.X, bounds.Min.Y + h - 1},
		{bounds.Min.X + w - 1, bounds.Min.Y + h - 1},
	}

	for _, pt := range corners {
		r, g, b, a := img.At(pt[0], pt[1]).RGBA()
		ru := uint8(r >> 8)
		gu := uint8(g >> 8)
		bu := uint8(b >> 8)
		au := uint8(a >> 8)

		if au >= 240 && ru >= 235 && gu >= 235 && bu >= 235 {
			return true
		}
	}
	return false
}

func writeTrackerMarkdown(items []TrackedItem, total, ok, white, missing int) error {
	var sb strings.Builder

	sb.WriteString("# Image Generation & Audit Tracker\n\n")
	sb.WriteString("> Persistent state tracker for upgrading all catalog hardware assets and banners to production-grade, true-transparent PNGs stored in MinIO (`aura-assets`).\n\n")

	sb.WriteString("### Summary Metrics\n")
	sb.WriteString(fmt.Sprintf("- **Total Images Audited:** `%d`\n", total))
	sb.WriteString(fmt.Sprintf("- **Production OK (Transparent in MinIO):** `%d`\n", ok))
	sb.WriteString(fmt.Sprintf("- **Has White Background (Opaque):** `%d`\n", white))
	sb.WriteString(fmt.Sprintf("- **Broken / 404 / Missing:** `%d`\n", missing))
	sb.WriteString(fmt.Sprintf("- **Last Audited:** `%s`\n\n", time.Now().Format("2006-01-02 15:04:05 MST")))

	sb.WriteString("---\n\n")
	sb.WriteString("### Asset Checklist\n\n")
	sb.WriteString("| Item ID / SKU | Product & Color Name | Target MinIO Path | Current Status | Tailored AI Prompt |\n")
	sb.WriteString("| :--- | :--- | :--- | :--- | :--- |\n")

	for _, item := range items {
		statusBadge := ""
		switch item.Status {
		case "OK":
			statusBadge = "✅ `OK`"
		case "WHITE_BG":
			statusBadge = "⚠️ `WHITE_BG`"
		case "MISSING":
			statusBadge = "❌ `MISSING`"
		default:
			statusBadge = fmt.Sprintf("`%s`", item.Status)
		}

		cleanPrompt := strings.ReplaceAll(item.Prompt, "|", "\\|")
		sb.WriteString(fmt.Sprintf("| `%s` | %s | `%s` | %s | %s |\n",
			item.ID,
			item.Name,
			item.TargetMinIO,
			statusBadge,
			cleanPrompt,
		))
	}

	content := sb.String()

	possiblePaths := []string{
		"/monorepo/IMAGE_GEN_TRACKER.md",
		"IMAGE_GEN_TRACKER.md",
		"../IMAGE_GEN_TRACKER.md",
		"../../IMAGE_GEN_TRACKER.md",
	}

	written := false
	for _, p := range possiblePaths {
		dir := filepath.Dir(p)
		if dir == "." || dir == "/" || dirExists(dir) {
			if err := os.WriteFile(p, []byte(content), 0644); err == nil {
				slog.Info("wrote tracker file", "path", p)
				written = true
			}
		}
	}

	if !written {
		return fmt.Errorf("could not write tracker file to any candidate location")
	}

	return nil
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// -----------------------------------------------------------------------
// Generation with Color-Level Deduplication & Edge Protection
// -----------------------------------------------------------------------

func runGenerate(ctx context.Context, db *gorm.DB, minioClient *storage.MinIOClient, items []TrackedItem, apiKey, skuFilter string) {
	slog.Info("starting generation workflow with color-level deduplication...", "filter", skuFilter)

	httpClient := newRobustHTTPClient()
	// Color-level cache: key = fmt.Sprintf("%s:%s", item.ProductSlug, item.ColorName)
	colorCache := make(map[string][]byte)

	for i := range items {
		item := &items[i]

		if skuFilter != "" && !strings.EqualFold(item.ID, skuFilter) {
			continue
		}

		if item.Status == "OK" {
			slog.Info("skipping already OK asset", "id", item.ID)
			continue
		}

		// Check if MinIO already has this asset as a valid transparent PNG
		stat, err := minioClient.Client().StatObject(ctx, minioClient.Bucket(), item.TargetMinIO, minio.StatObjectOptions{})
		if err == nil && stat.Size > 0 {
			obj, getErr := minioClient.Client().GetObject(ctx, minioClient.Bucket(), item.TargetMinIO, minio.GetObjectOptions{})
			if getErr == nil {
				img, _, decErr := image.Decode(obj)
				_ = obj.Close()
				if decErr == nil && hasTransparentCorners(img) {
					slog.Info("asset already exists in MinIO and has transparent corners, skipping", "id", item.ID)
					item.Status = "OK"
					item.CurrentURL = minioClient.GetPublicAssetURL(item.TargetMinIO)
					continue
				}
			}
		}

		colorKey := fmt.Sprintf("%s:%s", item.ProductSlug, item.ColorName)
		var pngBytes []byte

		if cached, found := colorCache[colorKey]; found {
			slog.Info("reusing cached color asset for matching SKU", "sku", item.ID, "colorKey", colorKey)
			pngBytes = cached
		} else {
			slog.Info("generating/extracting asset", "id", item.ID, "name", item.Name, "isLight", item.IsLight)

			var rawImg image.Image
			var genErr error

			if apiKey != "" {
				rawImg, genErr = callGeminiImageAPIWithRetry(ctx, apiKey, item.Prompt)
			}

			if genErr != nil || rawImg == nil {
				slog.Warn("AI generation unavailable, falling back to high-res source cutout extraction...", "id", item.ID, "url", item.CurrentURL, "ai_err", genErr)
				if item.CurrentURL != "" {
					var dlErr error
					rawImg, dlErr = downloadSourceImage(ctx, httpClient, item.CurrentURL)
					if dlErr != nil {
						slog.Error("failed to download source image fallback", "id", item.ID, "url", item.CurrentURL, "error", dlErr)
						continue
					}
					slog.Info("successfully downloaded high-res source image for background removal", "id", item.ID)
				} else {
					slog.Error("no source image available for fallback", "id", item.ID)
					continue
				}
			}

			// Post-processing: Edge-connected flood fill background removal with edge protection
			var transparentImg *image.RGBA
			if hasTransparentCorners(rawImg) {
				slog.Info("source image already has transparent corners, converting to RGBA", "id", item.ID)
				transparentImg = toRGBA(rawImg)
			} else {
				transparentImg = RemoveWhiteBackground(rawImg, item.IsLight)
			}

			// Verify (0,0) corner transparency gate
			cornerA := transparentImg.RGBAAt(0, 0).A
			if cornerA > 50 {
				slog.Warn("corner pixel (0,0) was not fully transparent, enforcing transparent corner", "id", item.ID, "alpha", cornerA)
				transparentImg.SetRGBA(0, 0, color.RGBA{0, 0, 0, 0})
			}

			// Encode as clean PNG
			var buf bytes.Buffer
			if err := png.Encode(&buf, transparentImg); err != nil {
				slog.Error("failed to encode transparent png", "id", item.ID, "error", err)
				continue
			}

			pngBytes = buf.Bytes()
			colorCache[colorKey] = pngBytes
		}

		// Upload target SKU to MinIO
		reader := bytes.NewReader(pngBytes)
		_, err = minioClient.Client().PutObject(ctx, minioClient.Bucket(), item.TargetMinIO, reader, int64(len(pngBytes)), minio.PutObjectOptions{
			ContentType: "image/png",
		})
		if err != nil {
			slog.Error("failed to upload to minio", "id", item.ID, "path", item.TargetMinIO, "error", err)
			continue
		}

		publicURL := minioClient.GetPublicAssetURL(item.TargetMinIO)
		slog.Info("uploaded transparent asset to minio", "id", item.ID, "url", publicURL)

		// Update PostgreSQL
		updateDatabaseAsset(db, item, publicURL)

		item.Status = "OK"
		item.CurrentURL = publicURL

		// Color-Level Deduplication: find matching sibling SKUs sharing this exact product + color
		for j := range items {
			sibling := &items[j]
			if sibling.ID != item.ID && sibling.ProductSlug == item.ProductSlug && sibling.ColorName == item.ColorName && sibling.Type == item.Type {
				slog.Info("applying color deduplication to sibling SKU", "sibling_sku", sibling.ID, "base_sku", item.ID)

				sibReader := bytes.NewReader(pngBytes)
				_, sibErr := minioClient.Client().PutObject(ctx, minioClient.Bucket(), sibling.TargetMinIO, sibReader, int64(len(pngBytes)), minio.PutObjectOptions{
					ContentType: "image/png",
				})
				if sibErr == nil {
					sibURL := minioClient.GetPublicAssetURL(sibling.TargetMinIO)
					updateDatabaseAsset(db, sibling, sibURL)
					sibling.Status = "OK"
					sibling.CurrentURL = sibURL
					slog.Info("sibling SKU updated successfully", "sku", sibling.ID, "url", sibURL)
				}
			}
		}

		// Persist state to IMAGE_GEN_TRACKER.md after each SKU or color family
		_ = writeTrackerMarkdown(items, len(items), countStatus(items, "OK"), countStatus(items, "WHITE_BG"), countStatus(items, "MISSING"))

		slog.Info("pausing 1 second between processing...")
		time.Sleep(1 * time.Second)
	}

	slog.Info("generation workflow finished, executing final comprehensive audit...")
	runAudit(ctx, db, minioClient, items)
}

func toRGBA(src image.Image) *image.RGBA {
	bounds := src.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, b, a := src.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			dst.SetRGBA(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(b >> 8),
				A: uint8(a >> 8),
			})
		}
	}
	return dst
}

func updateDatabaseAsset(db *gorm.DB, item *TrackedItem, publicURL string) {
	if item.Type == "PRODUCT_VARIANT" && item.VariantID != nil {
		imgJSON, _ := json.Marshal([]string{publicURL})
		if err := db.Model(&models.ProductVariant{}).Where("id = ?", *item.VariantID).Update("images", datatypes.JSON(imgJSON)).Error; err != nil {
			slog.Error("failed to update variant images in database", "sku", item.ID, "error", err)
		}
	} else if item.Type == "BANNER" && item.BannerID != nil {
		if err := db.Model(&models.Banner{}).Where("id = ?", *item.BannerID).Update("product_image_url", publicURL).Error; err != nil {
			slog.Error("failed to update banner image in database", "id", item.ID, "error", err)
		}
	}
}

func countStatus(items []TrackedItem, status string) int {
	c := 0
	for _, it := range items {
		if it.Status == status {
			c++
		}
	}
	return c
}

func callGeminiImageAPIWithRetry(ctx context.Context, apiKey, prompt string) (image.Image, error) {
	maxRetries := 3
	backoff := 12 * time.Second

	for attempt := 1; attempt <= maxRetries; attempt++ {
		img, err := callGeminiImageAPI(ctx, apiKey, prompt)
		if err == nil {
			return img, nil
		}

		if strings.Contains(err.Error(), "limit: 0") || strings.Contains(err.Error(), "limit exceeded on Free Tier") {
			slog.Warn("Gemini API key has 0 image generation quota on Free Tier; skipping further retries", "error", err)
			return nil, err
		}

		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") || strings.Contains(err.Error(), "RESOURCE_EXHAUSTED") {
			slog.Warn("rate limited or quota exhausted by Gemini API (HTTP 429), backing off...", "attempt", attempt, "sleep", backoff)
			select {
			case <-time.After(backoff):
				backoff *= 2
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		return nil, err
	}

	return nil, fmt.Errorf("exceeded max retries for prompt")
}

func callGeminiImageAPI(ctx context.Context, apiKey, prompt string) (image.Image, error) {
	models := []string{"gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-3-pro-image"}
	client := newRobustHTTPClient()

	var lastErr error
	for _, model := range models {
		endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)

		reqBody := map[string]interface{}{
			"contents": []map[string]interface{}{
				{
					"parts": []map[string]interface{}{
						{"text": prompt},
					},
				},
			},
			"generationConfig": map[string]interface{}{
				"responseModalities": []string{"IMAGE"},
			},
		}

		jsonPayload, err := json.Marshal(reqBody)
		if err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(jsonPayload))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			return nil, fmt.Errorf("HTTP 429: Too Many Requests / Resource Exhausted from %s: %s", model, string(bodyBytes))
		}

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("model %s returned HTTP %d: %s", model, resp.StatusCode, string(bodyBytes))
			continue
		}

		var geminiResp struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						InlineData *struct {
							MimeType string `json:"mimeType"`
							Data     string `json:"data"`
						} `json:"inlineData"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}

		if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
			lastErr = fmt.Errorf("failed to unmarshal %s response: %w", model, err)
			continue
		}

		for _, cand := range geminiResp.Candidates {
			for _, part := range cand.Content.Parts {
				if part.InlineData != nil && part.InlineData.Data != "" {
					decBytes, err := base64.StdEncoding.DecodeString(part.InlineData.Data)
					if err != nil {
						return nil, fmt.Errorf("failed to decode base64 image: %w", err)
					}

					img, _, err := image.Decode(bytes.NewReader(decBytes))
					if err != nil {
						return nil, fmt.Errorf("failed to decode image bytes: %w", err)
					}
					return img, nil
				}
			}
		}

		lastErr = fmt.Errorf("model %s did not return image inlineData", model)
	}

	return nil, lastErr
}

// RemoveWhiteBackground implements an edge-connected flood-fill algorithm
// starting exclusively from the outer boundaries, converting contiguous white/near-white
// pixels into a true alpha transparency channel with edge feathering and protection for light products.
func RemoveWhiteBackground(src image.Image, isLightProduct bool) *image.RGBA {
	bounds := src.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, w, h))

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, b, a := src.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			dst.SetRGBA(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(b >> 8),
				A: uint8(a >> 8),
			})
		}
	}

	visited := make([][]bool, h)
	for y := 0; y < h; y++ {
		visited[y] = make([]bool, w)
	}

	// For light products (e.g. Platinum White, Shell White, Silver), use strict neutrality and high brightness
	// to prevent bleeding into the metallic chassis or white keycaps.
	isBackgroundWhite := func(c color.RGBA) bool {
		if isLightProduct {
			dr := absDiff(int(c.R), int(c.G))
			dg := absDiff(int(c.G), int(c.B))
			db := absDiff(int(c.B), int(c.R))
			return c.R >= 248 && c.G >= 248 && c.B >= 248 && dr <= 3 && dg <= 3 && db <= 3
		}
		return c.R >= 238 && c.G >= 238 && c.B >= 238
	}

	type Point struct{ X, Y int }
	queue := make([]Point, 0, w*2+h*2)

	// Seed flood-fill queue from all 4 outer edges
	for x := 0; x < w; x++ {
		if isBackgroundWhite(dst.RGBAAt(x, 0)) {
			visited[0][x] = true
			queue = append(queue, Point{X: x, Y: 0})
		}
		if isBackgroundWhite(dst.RGBAAt(x, h-1)) {
			visited[h-1][x] = true
			queue = append(queue, Point{X: x, Y: h - 1})
		}
	}
	for y := 0; y < h; y++ {
		if !visited[y][0] && isBackgroundWhite(dst.RGBAAt(0, y)) {
			visited[y][0] = true
			queue = append(queue, Point{X: 0, Y: y})
		}
		if !visited[y][w-1] && isBackgroundWhite(dst.RGBAAt(w-1, y)) {
			visited[y][w-1] = true
			queue = append(queue, Point{X: w - 1, Y: y})
		}
	}

	dx := []int{0, 0, 1, -1}
	dy := []int{1, -1, 0, 0}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		c := dst.RGBAAt(curr.X, curr.Y)

		if isLightProduct {
			// Light product feathering
			if c.R >= 250 && c.G >= 250 && c.B >= 250 {
				dst.SetRGBA(curr.X, curr.Y, color.RGBA{0, 0, 0, 0})
			} else {
				brightness := (float64(c.R) + float64(c.G) + float64(c.B)) / 3.0
				alphaFraction := 1.0 - (brightness-246.0)/(250.0-246.0)
				if alphaFraction < 0 {
					alphaFraction = 0
				}
				if alphaFraction > 1 {
					alphaFraction = 1
				}
				newA := uint8(alphaFraction * float64(c.A))
				dst.SetRGBA(curr.X, curr.Y, color.RGBA{
					R: uint8(float64(c.R) * alphaFraction),
					G: uint8(float64(c.G) * alphaFraction),
					B: uint8(float64(c.B) * alphaFraction),
					A: newA,
				})
			}
		} else {
			// Dark/standard product feathering
			if c.R >= 244 && c.G >= 244 && c.B >= 244 {
				dst.SetRGBA(curr.X, curr.Y, color.RGBA{0, 0, 0, 0})
			} else {
				brightness := (float64(c.R) + float64(c.G) + float64(c.B)) / 3.0
				alphaFraction := 1.0 - (brightness-238.0)/(244.0-238.0)
				if alphaFraction < 0 {
					alphaFraction = 0
				}
				if alphaFraction > 1 {
					alphaFraction = 1
				}
				newA := uint8(alphaFraction * float64(c.A))
				dst.SetRGBA(curr.X, curr.Y, color.RGBA{
					R: uint8(float64(c.R) * alphaFraction),
					G: uint8(float64(c.G) * alphaFraction),
					B: uint8(float64(c.B) * alphaFraction),
					A: newA,
				})
			}
		}

		for i := 0; i < 4; i++ {
			nx, ny := curr.X+dx[i], curr.Y+dy[i]
			if nx >= 0 && nx < w && ny >= 0 && ny < h && !visited[ny][nx] {
				if isBackgroundWhite(dst.RGBAAt(nx, ny)) {
					visited[ny][nx] = true
					queue = append(queue, Point{X: nx, Y: ny})
				}
			}
		}
	}

	return dst
}

func absDiff(a, b int) int {
	if a > b {
		return a - b
	}
	return b - a
}
