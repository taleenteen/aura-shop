package service

import (
	"testing"

	"aura-tech/api/internal/models"
)

func TestDiff(t *testing.T) {
	before := Snapshot{"name": "Dock", "price": "฿1.00", "gone": "x"}
	after := Snapshot{"name": "Dock 2", "price": "฿1.00", "new": "y"}
	got := Diff(before, after)
	want := []models.AuditChange{
		{Field: "gone", From: "x", To: ""},
		{Field: "name", From: "Dock", To: "Dock 2"},
		{Field: "new", From: "", To: "y"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("change %d = %+v, want %+v", i, got[i], want[i])
		}
	}
	if created := Diff(nil, Snapshot{"name": "A", "empty": ""}); len(created) != 1 || created[0].To != "A" {
		t.Errorf("create diff: %+v", created)
	}
}

func TestProductSnapshotListsOptionsBySKU(t *testing.T) {
	p := &models.Product{Name: "Dock", Variants: []models.ProductVariant{
		{SKU: "D-1", ColorName: "Black", Price: 499000, Specs: []byte(`{"ram_gb":16,"cpu_family":""}`), Images: []byte(`["a","b"]`)},
	}}
	s := ProductSnapshot(p)
	if s["D-1.price"] != "฿4,990.00" || s["D-1.ram_gb"] != "16" || s["D-1.images"] != "2 image(s)" {
		t.Fatalf("snapshot: %+v", s)
	}
	if _, ok := s["D-1.cpu_family"]; ok {
		t.Error("empty spec values should be left out")
	}
}
