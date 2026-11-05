package service

import (
	"regexp"
	"testing"
	"time"
)

func TestNewOrderNumber(t *testing.T) {
	format := regexp.MustCompile(`^AURA-20261105-[0-9A-HJKMNP-TV-Z]{8}$`)
	day := time.Date(2026, 11, 5, 10, 0, 0, 0, time.UTC)
	seen := make(map[string]bool)
	for i := 0; i < 5000; i++ {
		n, err := newOrderNumber(day)
		if err != nil {
			t.Fatal(err)
		}
		if !format.MatchString(n) {
			t.Fatalf("unexpected format %q", n)
		}
		if seen[n] {
			t.Fatalf("collision after %d numbers: %s", i, n)
		}
		seen[n] = true
	}
}
