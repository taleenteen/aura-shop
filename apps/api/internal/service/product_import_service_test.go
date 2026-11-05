package service

import (
	"strings"
	"testing"
)

func TestParseCSVHandlesExcelQuirks(t *testing.T) {
	// BOM, semicolons (Excel in some locales), header spaces and case, an unknown column,
	// a quoted cell with a comma, and a blank line.
	text := utf8BOM + "Product Slug;SKU;Price;Notes\n" +
		"mba-13;mba-1;\"39,900\";x\n" +
		";;;\n" +
		"mba-13;MBA-2;41900;y\n"
	rows, issues, warnings := parseCSV(text)
	if len(issues) > 0 {
		t.Fatalf("issues: %+v", issues)
	}
	if len(rows) != 2 || rows[0].line != 2 || rows[1].line != 4 {
		t.Fatalf("rows: %+v", rows)
	}
	if rows[0].vals["price"] != "39,900" || rows[0].vals["product_slug"] != "mba-13" {
		t.Fatalf("values: %+v", rows[0].vals)
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "Notes") {
		t.Fatalf("warnings: %v", warnings)
	}
}

func TestParseCSVRejectsBadFiles(t *testing.T) {
	for name, text := range map[string]string{
		"missing sku":   "product_name,price\nA,1\n",
		"no rows":       "product_name,sku\n",
		"not utf8":      "product_name,sku\n\xff\xfe,1\n",
		"duplicate col": "sku,SKU\n1,2\n",
	} {
		if _, issues, _ := parseCSV(text); len(issues) == 0 {
			t.Errorf("%s: expected a file issue", name)
		}
	}
}

func TestGroupRows(t *testing.T) {
	rows, _, _ := parseCSV("product_slug,product_name,sku,tagline\n" +
		",MacBook Air 13,a-1,Thin\n" +
		"macbook-air-13,MacBook Air 13,A-2,Light\n" + // same product via derived slug; tagline differs
		"macbook-air-13,,A-1,\n" + // duplicate SKU
		",,b-1,\n") // no product
	groups, loose := groupRows(rows)
	if len(groups) != 1 || groups[0].key != "macbook-air-13" || len(groups[0].variants) != 2 {
		t.Fatalf("groups: %+v", groups)
	}
	if groups[0].variants[0].vals["sku"] != "A-1" {
		t.Fatalf("sku not uppercased: %q", groups[0].variants[0].vals["sku"])
	}
	var msgs []string
	for _, is := range groups[0].issues {
		msgs = append(msgs, is.Column+": "+is.Message)
	}
	joined := strings.Join(msgs, " | ")
	if !strings.Contains(joined, "tagline: Differs from row 2") || !strings.Contains(joined, "SKU A-1 is already on row 2") {
		t.Fatalf("issues: %s", joined)
	}
	if len(loose) != 1 || loose[0].Row != 5 {
		t.Fatalf("loose: %+v", loose)
	}
}

func TestParseBahtAndFormat(t *testing.T) {
	for in, want := range map[string]int64{"39900": 3990000, "39,900.50": 3990050, "฿1,234": 123400, "0": 0} {
		if got, ok := parseBaht(in); !ok || got != want {
			t.Errorf("parseBaht(%q) = %d %v", in, got, ok)
		}
	}
	if _, ok := parseBaht("abc"); ok {
		t.Error("parseBaht accepted text")
	}
	if got := formatBaht(3990050); got != "฿39,900.50" {
		t.Errorf("formatBaht = %s", got)
	}
}
