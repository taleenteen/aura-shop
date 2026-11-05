package repository

import (
	"testing"

	"aura-tech/api/internal/dto"
)

func TestBuildOptionsHidesZerosButKeepsSelection(t *testing.T) {
	rows := []facetRow{{Value: "apple", Label: "Apple", Count: 2}, {Value: "asus", Label: "ASUS", Count: 0}}

	got := buildOptions(rows, "", func(v string) string { return v })
	if len(got) != 1 || got[0].Value != "apple" {
		t.Fatalf("zero-count option should be hidden: %+v", got)
	}

	got = buildOptions(rows, "asus", func(v string) string { return v })
	if len(got) != 2 || got[1].Value != "asus" || got[1].Count != 0 {
		t.Fatalf("selected zero-count option must stay so it can be unticked: %+v", got)
	}

	got = buildOptions(rows, "lenovo", func(v string) string { return "Lenovo" })
	if len(got) != 2 || got[1].Label != "Lenovo" {
		t.Fatalf("selected value missing from rows must be appended: %+v", got)
	}
}

func TestVariantCondsSkipsOwnGroup(t *testing.T) {
	f := dto.CatalogFilter{CPU: "Apple M4", RAM: 16, Storage: 512}
	conds, args := variantConds(f, groupCPU, "v")
	if len(conds) != 2 || len(args) != 2 {
		t.Fatalf("CPU facet must ignore the CPU filter only: %v %v", conds, args)
	}
	conds, _ = variantConds(f, groupNone, "v")
	if len(conds) != 3 {
		t.Fatalf("listing applies every spec filter: %v", conds)
	}
	if conds[0] != "LOWER(v.specs->>'cpu_family') = LOWER(?)" {
		t.Fatalf("CPU must match exactly, not as a substring: %s", conds[0])
	}
}

func TestStorageLabel(t *testing.T) {
	for in, want := range map[string]string{"256": "256GB", "1024": "1TB", "2048": "2TB", "x": "x"} {
		if got := storageLabel(in); got != want {
			t.Errorf("storageLabel(%q) = %q, want %q", in, got, want)
		}
	}
}
