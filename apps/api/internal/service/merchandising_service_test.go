package service

import (
	"errors"
	"testing"
	"time"

	"aura-tech/api/internal/dto"
)

func TestBuildBannerValidation(t *testing.T) {
	start := time.Now()
	ok := dto.BannerInput{
		Placement: "hero_split", Headline: "MacBook Pro", ProductImageURL: "https://cdn.example.com/mbp.webp",
		CTAPrimaryLink: "/products/macbook-pro-14-m4", StartAt: start, EndAt: start.Add(time.Hour),
	}
	b, err := buildBanner(ok)
	if err != nil || b.Placement != "HERO_SPLIT" || b.ThemeMode != "DARK" || b.CTAPrimaryText != "Shop Now" {
		t.Fatalf("valid banner: %+v %v", b, err)
	}

	bad := ok
	bad.CTAPrimaryLink = "javascript:alert(1)"
	bad.EndAt = start.Add(-time.Hour)
	bad.BackgroundColor = "red; background:url(x)"
	_, err = buildBanner(bad)
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError, got %v", err)
	}
	for _, k := range []string{"cta_primary_link", "end_at", "background_color"} {
		if ve.Fields[k] == "" {
			t.Errorf("missing error for %s: %v", k, ve.Fields)
		}
	}

	ribbon := dto.BannerInput{Placement: "TOP_RIBBON", Headline: "Free delivery", ProductImageURL: "ignored", StartAt: start, EndAt: start.Add(time.Hour)}
	if b, err := buildBanner(ribbon); err != nil || b.ProductImageURL != "" {
		t.Fatalf("ribbon needs no image or link: %+v %v", b, err)
	}
}

func TestValidLink(t *testing.T) {
	for s, want := range map[string]bool{
		"/catalog?category=mac": true, "https://x.co/a.png": true,
		"//evil.com": false, "javascript:alert(1)": false, "ftp://x.co": false, "catalog": false,
	} {
		if validLink(s) != want {
			t.Errorf("validLink(%q) = %v", s, !want)
		}
	}
}
