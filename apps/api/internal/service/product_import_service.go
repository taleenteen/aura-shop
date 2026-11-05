package service

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

// ---------------------------------------------------------------- columns

// ImportColumns is the product CSV layout: one row per option (variant); product columns repeat
// on every row of the same product. It feeds the downloadable guide and template.
var ImportColumns = []dto.ImportColumn{
	{Key: "product_slug", Label: "Product URL slug", Level: "product", Format: "lowercase-with-dashes", Example: "aura-book-14",
		Notes: "Identifies the product. Rows with the same slug are one product. Leave blank to build it from the name. Never changes an existing product's slug."},
	{Key: "product_name", Label: "Product name", Level: "product", RequiredNew: true, Format: "text, 2–200", Example: "Aura Book 14 (Example)"},
	{Key: "category", Label: "Category", Level: "product", RequiredNew: true, Format: "category slug", Example: "ultrabooks", Notes: "Must be an existing category slug (see Categories & Brands)."},
	{Key: "brand", Label: "Brand", Level: "product", RequiredNew: true, Format: "brand slug", Example: "lenovo", Notes: "Must be an existing brand slug."},
	{Key: "tagline", Label: "Tagline", Level: "product", Format: "text, max 200", Example: "All-day power in 1.2 kg."},
	{Key: "short_description", Label: "Short description", Level: "product", Format: "text, max 1,000", Example: "A 14-inch ultrabook for work and travel."},
	{Key: "use_cases", Label: "Use cases", Level: "product", Format: "list separated by |", Example: "ULTRALIGHT|OFFICE", Notes: "Any of CREATOR, GAMING, ULTRALIGHT, OFFICE."},
	{Key: "on_sale", Label: "On sale", Level: "product", Format: "yes / no", Example: "yes", Notes: "New products default to yes."},
	{Key: "sku", Label: "SKU", Level: "variant", RequiredNew: true, Format: "A–Z, 0–9, dashes; 2–64", Example: "AB14-16-512-GR",
		Notes: "Identifies the option. Required on every row. An SKU belongs to one product only."},
	{Key: "color_name", Label: "Colour name", Level: "variant", RequiredNew: true, Format: "text, max 50", Example: "Graphite"},
	{Key: "color_hex", Label: "Colour hex", Level: "variant", RequiredNew: true, Format: "#RRGGBB", Example: "#3A3B3F"},
	{Key: "price", Label: "Price (THB)", Level: "variant", RequiredNew: true, Format: "number, baht", Example: "32900", Notes: "Commas and ฿ are fine: 39,900.00"},
	{Key: "compare_price", Label: "Compare-at price (THB)", Level: "variant", Format: "number, baht", Example: "35900", Notes: "Strikethrough price; must be higher than price. 0 removes it."},
	{Key: "stock", Label: "Stock on hand", Level: "variant", Format: "whole number", Example: "12",
		Notes: "New options: opening stock. Existing options: recorded as a stock count correction. Cannot go below units held in checkout."},
	{Key: "images", Label: "Image URLs", Level: "variant", Format: "https links separated by |", Example: "https://cdn.example.com/aura-book-14-front.webp|https://cdn.example.com/aura-book-14-side.webp",
		Notes: "Replaces the option's images. Max 10."},
	{Key: "cpu_family", Label: "CPU family", Level: "variant", Format: "text", Example: "Intel Core Ultra 7", Notes: "Used by the catalogue filters."},
	{Key: "cpu_detail", Label: "CPU detail", Level: "variant", Format: "text", Example: "155H, 16 cores"},
	{Key: "ram_gb", Label: "RAM (GB)", Level: "variant", Format: "whole number", Example: "16"},
	{Key: "storage_gb", Label: "Storage (GB)", Level: "variant", Format: "whole number", Example: "256"},
	{Key: "screen_size_inch", Label: "Screen (inch)", Level: "variant", Format: "number", Example: "14"},
	{Key: "panel_type", Label: "Panel type", Level: "variant", Format: "text", Example: "OLED"},
	{Key: "refresh_rate_hz", Label: "Refresh rate (Hz)", Level: "variant", Format: "whole number", Example: "90"},
	{Key: "weight_kg", Label: "Weight (kg)", Level: "variant", Format: "number", Example: "1.2"},
	{Key: "has_thunderbolt", Label: "Thunderbolt", Level: "variant", Format: "yes / no", Example: "no"},
}

var (
	columnByKey   = map[string]dto.ImportColumn{}
	productFields = []string{"product_name", "category", "brand", "tagline", "short_description", "use_cases", "on_sale"}
	variantFields = []string{"color_name", "color_hex", "price", "compare_price", "stock", "images",
		"cpu_family", "cpu_detail", "ram_gb", "storage_gb", "screen_size_inch", "panel_type", "refresh_rate_hz", "weight_kg", "has_thunderbolt"}
	specKinds = map[string]string{ // spec column -> value kind
		"cpu_family": "text", "cpu_detail": "text", "panel_type": "text",
		"ram_gb": "int", "storage_gb": "int", "refresh_rate_hz": "int",
		"screen_size_inch": "float", "weight_kg": "float", "has_thunderbolt": "bool",
	}
)

func init() {
	for _, c := range ImportColumns {
		columnByKey[c.Key] = c
	}
}

// utf8BOM marks a file as UTF-8 for Excel; files saved by Excel may start with it.
const utf8BOM = string(rune(0xFEFF))

const (
	maxImportBytes = 2 << 20 // 2 MB of CSV text
	maxImportRows  = 2000
)

// ---------------------------------------------------------------- service

// ProductImportService previews and applies a product CSV.
type ProductImportService interface {
	Columns() []dto.ImportColumn
	Preview(ctx context.Context, req dto.ImportRequest) (*dto.ImportPreview, error)
	Commit(ctx context.Context, req dto.ImportCommitRequest, actor repository.Actor) (*dto.ImportResult, error)
	Export(ctx context.Context) ([]byte, error)
}

type productImportService struct {
	admin  *productAdminService
	lookup repository.ProductImportLookup
}

func NewProductImportService(adminRepo repository.ProductAdminRepository, lookup repository.ProductImportLookup) ProductImportService {
	return &productImportService{admin: &productAdminService{repo: adminRepo}, lookup: lookup}
}

func (s *productImportService) Columns() []dto.ImportColumn { return ImportColumns }

// ---------------------------------------------------------------- parsing

type csvRow struct {
	line int // spreadsheet row; the header is row 1
	vals map[string]string
}

type importGroup struct {
	key      string
	rows     []csvRow
	product  map[string]string // product column -> value (first non-blank)
	variants []csvRow          // one per SKU, file order
	issues   []dto.ImportIssue
}

func normalizeHeader(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	h = strings.NewReplacer(" ", "_", "-", "_").Replace(h)
	return strings.Trim(h, "_")
}

// parseCSV reads the file into rows keyed by column. File-level problems stop the import.
func parseCSV(text string) ([]csvRow, []dto.ImportIssue, []string) {
	var warnings []string
	if len(text) > maxImportBytes {
		return nil, []dto.ImportIssue{{Message: "The file is larger than 2 MB. Split it into smaller files."}}, nil
	}
	text = strings.TrimPrefix(text, utf8BOM)
	if !utf8.ValidString(text) {
		return nil, []dto.ImportIssue{{Message: `The file isn't UTF-8 text. In Excel use "Save As → CSV UTF-8 (Comma delimited)"; in Google Sheets use "Download → CSV".`}}, nil
	}
	if strings.TrimSpace(text) == "" {
		return nil, []dto.ImportIssue{{Message: "The file is empty."}}, nil
	}

	firstLine, _, _ := strings.Cut(text, "\n")
	delim := ','
	if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
		delim = ';'
	} else if strings.Count(firstLine, "\t") > strings.Count(firstLine, ",") {
		delim = '\t'
	}
	r := csv.NewReader(strings.NewReader(text))
	r.Comma = delim
	r.FieldsPerRecord = -1
	r.LazyQuotes = true

	header, err := r.Read()
	if err != nil {
		return nil, []dto.ImportIssue{{Row: 1, Message: "Could not read the header row."}}, nil
	}
	cols := make([]string, len(header))
	seen := map[string]bool{}
	var unknown []string
	for i, h := range header {
		k := normalizeHeader(h)
		if _, ok := columnByKey[k]; !ok {
			if k != "" {
				unknown = append(unknown, strings.TrimSpace(h))
			}
			continue
		}
		if seen[k] {
			return nil, []dto.ImportIssue{{Row: 1, Column: k, Message: "Column " + k + " appears twice."}}, nil
		}
		seen[k] = true
		cols[i] = k
	}
	if len(unknown) > 0 {
		warnings = append(warnings, "Ignored columns not in the template: "+strings.Join(unknown, ", ")+".")
	}
	var missing []string
	if !seen["sku"] {
		missing = append(missing, "sku")
	}
	if !seen["product_slug"] && !seen["product_name"] {
		missing = append(missing, "product_slug or product_name")
	}
	if len(missing) > 0 {
		return nil, []dto.ImportIssue{{Row: 1, Message: "Missing required column: " + strings.Join(missing, ", ") + ". Start from the template."}}, nil
	}

	var rows []csvRow
	for line := 2; ; line++ {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, []dto.ImportIssue{{Row: line, Message: "This row isn't valid CSV (check quotes)."}}, nil
		}
		vals := map[string]string{}
		blank := true
		for i, v := range rec {
			if i < len(cols) && cols[i] != "" {
				v = strings.TrimSpace(v)
				vals[cols[i]] = v
				if v != "" {
					blank = false
				}
			}
		}
		if blank {
			continue
		}
		rows = append(rows, csvRow{line: line, vals: vals})
		if len(rows) > maxImportRows {
			return nil, []dto.ImportIssue{{Message: fmt.Sprintf("More than %d rows. Split the file.", maxImportRows)}}, nil
		}
	}
	if len(rows) == 0 {
		return nil, []dto.ImportIssue{{Message: "The file has a header but no rows."}}, nil
	}
	return rows, nil, warnings
}

// groupRows gathers rows by product key and checks that product columns agree across them.
func groupRows(rows []csvRow) ([]*importGroup, []dto.ImportIssue) {
	var groups []*importGroup
	byKey := map[string]*importGroup{}
	skuRow := map[string]int{}
	var loose []dto.ImportIssue
	for _, row := range rows {
		slug := strings.ToLower(row.vals["product_slug"])
		key := slug
		if key == "" {
			key = Slugify(row.vals["product_name"])
		}
		if key == "" {
			loose = append(loose, dto.ImportIssue{Row: row.line, Column: "product_slug", Message: "Add a product_slug or product_name so the row belongs to a product."})
			continue
		}
		g := byKey[key]
		if g == nil {
			g = &importGroup{key: key, product: map[string]string{}}
			byKey[key] = g
			groups = append(groups, g)
		}
		g.rows = append(g.rows, row)
		for _, f := range productFields {
			v := row.vals[f]
			if v == "" {
				continue
			}
			if cur, ok := g.product[f]; !ok {
				g.product[f] = v
			} else if cur != v {
				g.issues = append(g.issues, dto.ImportIssue{Row: row.line, Column: f,
					Message: fmt.Sprintf("Differs from row %d (%q). Use the same value on every row of a product.", g.rows[0].line, cur)})
			}
		}
		sku := strings.ToUpper(row.vals["sku"])
		row.vals["sku"] = sku
		switch {
		case sku == "":
			g.issues = append(g.issues, dto.ImportIssue{Row: row.line, Column: "sku", Message: "Every row needs an SKU."})
		case skuRow[sku] != 0:
			g.issues = append(g.issues, dto.ImportIssue{Row: row.line, Column: "sku", Message: fmt.Sprintf("SKU %s is already on row %d.", sku, skuRow[sku])})
		default:
			skuRow[sku] = row.line
			g.variants = append(g.variants, row)
		}
	}
	return groups, loose
}

// ---------------------------------------------------------------- value parsing

func parseBool(s string) (bool, bool) {
	switch strings.ToLower(s) {
	case "yes", "y", "true", "1", "on":
		return true, true
	case "no", "n", "false", "0", "off":
		return false, true
	}
	return false, false
}

// parseBaht turns "39,900.50" or "฿39900" into satang.
func parseBaht(s string) (int64, bool) {
	s = strings.NewReplacer(",", "", "฿", "", "THB", "", " ", "").Replace(s)
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f < 0 || math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, false
	}
	return int64(math.Round(f * 100)), true
}

func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, "|") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func formatBaht(satang int64) string {
	baht := satang / 100
	s := strconv.FormatInt(baht, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return fmt.Sprintf("฿%s.%02d", b.String(), satang%100)
}

func yesNo(b bool) string {
	if b {
		return "Yes"
	}
	return "No"
}

// specValue parses a spec column; ok is false when the text doesn't fit the column.
func specValue(col, raw string) (interface{}, bool) {
	switch specKinds[col] {
	case "int":
		n, err := strconv.Atoi(strings.ReplaceAll(raw, ",", ""))
		return n, err == nil && n >= 0
	case "float":
		f, err := strconv.ParseFloat(raw, 64)
		return f, err == nil && f >= 0
	case "bool":
		return parseBool(raw)
	}
	return raw, utf8.RuneCountInString(raw) <= 120
}

func specText(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case bool:
		return yesNo(x)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case int:
		return strconv.Itoa(x)
	case string:
		return x
	}
	return fmt.Sprint(v)
}

// ---------------------------------------------------------------- plan

// stockSet is a stock count from the file for an existing option.
type stockSet struct {
	variantID uuid.UUID
	sku       string
	current   int
	target    int
}

// plan is one product of the file resolved against the store.
type plan struct {
	group    *importGroup
	status   string
	target   *models.Product // product the rows apply to (nil = create)
	match    *dto.ImportMatch
	changes  []dto.ImportChange
	newSKUs  []string
	input    dto.ProductInput
	stock    []stockSet
	rowOfVar []int // merged input variant index -> CSV row (0 = untouched existing option)
	issues   []dto.ImportIssue
}

type lookups struct {
	categories map[string]uuid.UUID
	brands     map[string]uuid.UUID
	owners     map[string]repository.VariantOwner
}

func (s *productImportService) loadLookups(ctx context.Context, groups []*importGroup) (*lookups, map[string]repository.ProductRef, map[string][]repository.ProductRef, error) {
	cats, err := s.lookup.CategorySlugs(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	brands, err := s.lookup.BrandSlugs(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	var keys, names, skus []string
	for _, g := range groups {
		keys = append(keys, g.key)
		if n := g.product["product_name"]; n != "" {
			names = append(names, n)
		}
		for _, v := range g.variants {
			skus = append(skus, v.vals["sku"])
		}
	}
	bySlug, err := s.lookup.ProductsBySlug(ctx, keys)
	if err != nil {
		return nil, nil, nil, err
	}
	byName, err := s.lookup.ProductsByName(ctx, names)
	if err != nil {
		return nil, nil, nil, err
	}
	owners, err := s.lookup.VariantOwners(ctx, skus)
	if err != nil {
		return nil, nil, nil, err
	}
	return &lookups{categories: cats, brands: brands, owners: owners}, bySlug, byName, nil
}

// toInput turns a stored product into the editor's input, so a merge starts from what exists.
func toInput(p *models.Product) dto.ProductInput {
	var personas []string
	_ = json.Unmarshal(p.UsagePersonas, &personas)
	in := dto.ProductInput{
		Name: p.Name, Slug: p.Slug, CategoryID: p.CategoryID, BrandID: p.BrandID,
		Tagline: p.Tagline, ShortDescription: p.ShortDescription, UsagePersonas: personas,
		BentoHighlights: json.RawMessage(p.BentoHighlights), BoxContents: json.RawMessage(p.BoxContents),
		PortsDiagram: json.RawMessage(p.PortsDiagram), FullSpecMatrix: json.RawMessage(p.FullSpecMatrix),
		IsActive: p.IsActive,
	}
	for _, v := range p.Variants {
		id := v.ID
		specs := map[string]interface{}{}
		_ = json.Unmarshal(v.Specs, &specs)
		var images []string
		_ = json.Unmarshal(v.Images, &images)
		in.Variants = append(in.Variants, dto.VariantInput{
			ID: &id, SKU: v.SKU, ColorName: v.ColorName, ColorHex: v.ColorHex,
			Price: v.Price, ComparePrice: v.ComparePrice, Specs: specs, Images: images,
		})
	}
	return in
}

// resolve compares one product of the file with the store. target is the product the rows
// apply to (nil to create one); keep lists change keys to leave as they are.
func (s *productImportService) resolve(ctx context.Context, g *importGroup, target *models.Product, lk *lookups, keep map[string]bool) *plan {
	p := &plan{group: g, target: target, issues: append([]dto.ImportIssue(nil), g.issues...)}
	first := g.rows[0].line
	issue := func(row int, col, msg string) {
		p.issues = append(p.issues, dto.ImportIssue{Row: row, Column: col, Message: msg})
	}
	change := func(key, sku, label, cur, inc string) bool {
		if target == nil {
			return true // a new product takes every value; there is nothing to compare
		}
		if cur == inc {
			return false
		}
		p.changes = append(p.changes, dto.ImportChange{Key: key, SKU: sku, Label: label, Current: cur, Incoming: inc})
		return !keep[key]
	}

	if target != nil {
		p.input = toInput(target)
	} else {
		p.input = dto.ProductInput{Slug: g.key, IsActive: true, Variants: []dto.VariantInput{}}
		for _, f := range []string{"product_name", "category", "brand"} {
			if g.product[f] == "" {
				issue(first, f, columnByKey[f].Label+" is required for a new product.")
			}
		}
	}
	in := &p.input
	catName := func(id uuid.UUID) string {
		for slug, cid := range lk.categories {
			if cid == id {
				return slug
			}
		}
		return ""
	}
	brandName := func(id uuid.UUID) string {
		for slug, bid := range lk.brands {
			if bid == id {
				return slug
			}
		}
		return ""
	}

	// Product columns. Blank cells keep the current value.
	pv := g.product
	if v := pv["product_name"]; v != "" && change("name", "", "Name", in.Name, v) {
		in.Name = v
	}
	if v := strings.ToLower(pv["category"]); v != "" {
		if id, ok := lk.categories[v]; !ok {
			issue(first, "category", fmt.Sprintf("Unknown category %q. Use a slug from Categories & Brands.", v))
		} else if change("category", "", "Category", catName(in.CategoryID), v) {
			in.CategoryID = id
		}
	}
	if v := strings.ToLower(pv["brand"]); v != "" {
		if id, ok := lk.brands[v]; !ok {
			issue(first, "brand", fmt.Sprintf("Unknown brand %q. Use a slug from Categories & Brands.", v))
		} else if change("brand", "", "Brand", brandName(in.BrandID), v) {
			in.BrandID = id
		}
	}
	if v := pv["tagline"]; v != "" && change("tagline", "", "Tagline", in.Tagline, v) {
		in.Tagline = v
	}
	if v := pv["short_description"]; v != "" && change("short_description", "", "Short description", in.ShortDescription, v) {
		in.ShortDescription = v
	}
	if v := pv["use_cases"]; v != "" {
		list := splitList(strings.ToUpper(v))
		if change("use_cases", "", "Use cases", strings.Join(in.UsagePersonas, " | "), strings.Join(list, " | ")) {
			in.UsagePersonas = list
		}
	}
	if v := pv["on_sale"]; v != "" {
		if b, ok := parseBool(v); !ok {
			issue(first, "on_sale", "Use yes or no.")
		} else if change("on_sale", "", "On sale", yesNo(in.IsActive), yesNo(b)) {
			in.IsActive = b
		}
	}

	// Options.
	bySKU := map[string]int{}
	for i, v := range in.Variants {
		bySKU[v.SKU] = i
	}
	p.rowOfVar = make([]int, len(in.Variants))
	for _, row := range g.variants {
		vals := row.vals
		sku := vals["sku"]
		idx, existing := bySKU[sku]
		owner, taken := lk.owners[sku]
		conflict := taken && (target == nil || owner.ID != target.ID)
		if conflict {
			// Keep checking the row's other cells so every problem shows at once.
			issue(row.line, "sku", fmt.Sprintf("SKU %s already belongs to %q (%s).", sku, owner.Name, owner.Slug))
		}
		if !existing {
			for _, f := range []string{"color_name", "color_hex", "price"} {
				if vals[f] == "" {
					issue(row.line, f, columnByKey[f].Label+" is required for a new option.")
				}
			}
			in.Variants = append(in.Variants, dto.VariantInput{SKU: sku, Specs: map[string]interface{}{}, Images: []string{}})
			idx = len(in.Variants) - 1
			p.rowOfVar = append(p.rowOfVar, row.line)
			if !conflict {
				p.newSKUs = append(p.newSKUs, sku)
			}
		} else {
			p.rowOfVar[idx] = row.line
		}
		v := &in.Variants[idx]
		// For new options every value applies; changes are only listed for existing ones.
		apply := func(field, label, cur, inc string) bool {
			if !existing {
				return true
			}
			return change("sku:"+sku+":"+field, sku, label, cur, inc)
		}

		if x := vals["color_name"]; x != "" && apply("color_name", "Colour", v.ColorName, x) {
			v.ColorName = x
		}
		if x := strings.ToUpper(vals["color_hex"]); x != "" {
			if !strings.HasPrefix(x, "#") {
				x = "#" + x
			}
			if !hexPattern.MatchString(x) {
				issue(row.line, "color_hex", "Use a hex colour like #2E2C2E.")
			} else if apply("color_hex", "Colour hex", strings.ToUpper(v.ColorHex), x) {
				v.ColorHex = x
			}
		}
		if x := vals["price"]; x != "" {
			if n, ok := parseBaht(x); !ok || n == 0 {
				issue(row.line, "price", "Use a price in baht, e.g. 39900.")
			} else if apply("price", "Price", formatBaht(v.Price), formatBaht(n)) {
				v.Price = n
			}
		}
		if x := vals["compare_price"]; x != "" {
			if n, ok := parseBaht(x); !ok {
				issue(row.line, "compare_price", "Use a price in baht, or 0 to remove it.")
			} else if apply("compare_price", "Compare-at price", formatBaht(v.ComparePrice), formatBaht(n)) {
				v.ComparePrice = n
			}
		}
		if x := vals["images"]; x != "" {
			list := splitList(x)
			if apply("images", "Images", strings.Join(v.Images, "\n"), strings.Join(list, "\n")) {
				v.Images = list
			}
		}
		for col := range specKinds {
			x := vals[col]
			if x == "" {
				continue
			}
			val, ok := specValue(col, x)
			if !ok {
				issue(row.line, col, columnByKey[col].Label+": use "+columnByKey[col].Format+".")
				continue
			}
			if apply(col, columnByKey[col].Label, specText(v.Specs[col]), specText(val)) {
				if v.Specs == nil {
					v.Specs = map[string]interface{}{}
				}
				// Numbers go through JSON as float64, the same as the editor sends them.
				if n, isInt := val.(int); isInt {
					v.Specs[col] = float64(n)
				} else {
					v.Specs[col] = val
				}
			}
		}
		if x := vals["stock"]; x != "" {
			n, err := strconv.Atoi(strings.ReplaceAll(x, ",", ""))
			if err != nil || n < 0 || n > maxStockPerChange {
				issue(row.line, "stock", "Use a whole number of units, 0 or more.")
			} else if !existing {
				v.InitialStock = n
			} else {
				var cur models.ProductVariant
				for _, tv := range target.Variants {
					if tv.SKU == sku {
						cur = tv
					}
				}
				if apply("stock", "Stock on hand", strconv.Itoa(cur.StockQuantity), strconv.Itoa(n)) {
					if n < cur.ReservedStock {
						issue(row.line, "stock", fmt.Sprintf("%d unit(s) are held in checkout; stock can't go below that.", cur.ReservedStock))
					} else {
						p.stock = append(p.stock, stockSet{variantID: cur.ID, sku: sku, current: cur.StockQuantity, target: n})
					}
				}
			}
		}
	}

	// Run the editor's own validation over the merged product.
	if len(p.issues) == 0 {
		var id *uuid.UUID
		if target != nil {
			id = &target.ID
		}
		if _, _, err := s.admin.build(ctx, p.input, id); err != nil {
			var ve *ValidationError
			if !errors.As(err, &ve) {
				issue(first, "", err.Error())
			} else {
				for key, msg := range ve.Fields {
					row, col := first, buildKeyColumn(key)
					var n int
					var field string
					if _, scanErr := fmt.Sscanf(key, "variants.%d.%s", &n, &field); scanErr == nil && n < len(p.rowOfVar) && p.rowOfVar[n] != 0 {
						row = p.rowOfVar[n]
					}
					issue(row, col, msg)
				}
			}
		}
	}
	sort.SliceStable(p.issues, func(i, j int) bool { return p.issues[i].Row < p.issues[j].Row })
	return p
}

// buildKeyColumn maps the editor's error keys to CSV columns.
func buildKeyColumn(key string) string {
	switch key {
	case "name":
		return "product_name"
	case "slug":
		return "product_slug"
	case "category_id":
		return "category"
	case "brand_id":
		return "brand"
	case "usage_personas":
		return "use_cases"
	}
	if i := strings.LastIndexByte(key, '.'); i >= 0 {
		switch f := key[i+1:]; f {
		case "initial_stock":
			return "stock"
		case "specs":
			return "cpu_family"
		default:
			return f
		}
	}
	return key
}

// analyze parses the file and resolves every product. decisions may be nil (preview).
func (s *productImportService) analyze(ctx context.Context, req dto.ImportRequest, decisions map[string]dto.ImportDecision) (*dto.ImportPreview, []*plan, error) {
	out := &dto.ImportPreview{Products: []dto.ImportProduct{}, FileIssues: []dto.ImportIssue{}, Warnings: []string{}}
	rows, fileIssues, warnings := parseCSV(req.CSV)
	out.Warnings = append(out.Warnings, warnings...)
	if len(fileIssues) > 0 {
		out.FileIssues = fileIssues
		return out, nil, nil
	}
	groups, loose := groupRows(rows)
	out.FileIssues = append(out.FileIssues, loose...)
	out.Summary.Rows = len(rows)

	lk, bySlug, byName, err := s.loadLookups(ctx, groups)
	if err != nil {
		return nil, nil, err
	}

	var plans []*plan
	for _, g := range groups {
		var target *models.Product
		var match *dto.ImportMatch
		status := "create"
		if ref, ok := bySlug[g.key]; ok {
			status = "update"
			match = &dto.ImportMatch{ID: ref.ID, Slug: ref.Slug, Name: ref.Name}
		} else if refs := byName[strings.ToLower(strings.TrimSpace(g.product["product_name"]))]; len(refs) > 0 {
			status = "name_match"
			match = &dto.ImportMatch{ID: refs[0].ID, Slug: refs[0].Slug, Name: refs[0].Name}
		}

		d, decided := decisions[g.key]
		mergeInto := status == "update" || (status == "name_match" && (!decided || d.Action == "update"))
		if mergeInto {
			if target, err = s.admin.repo.GetProduct(ctx, match.ID); err != nil {
				return nil, nil, err
			}
		}
		keep := map[string]bool{}
		for _, k := range d.Keep {
			keep[k] = true
		}
		p := s.resolve(ctx, g, target, lk, keep)
		p.match = match
		switch {
		case len(p.issues) > 0:
			p.status = "error"
		case status == "update" && len(p.changes) == 0 && len(p.newSKUs) == 0:
			p.status = "unchanged"
		default:
			p.status = status
		}
		plans = append(plans, p)

		rowNums := make([]int, len(g.rows))
		for i, r := range g.rows {
			rowNums[i] = r.line
		}
		name := g.product["product_name"]
		if name == "" && match != nil {
			name = match.Name
		}
		item := dto.ImportProduct{
			Key: g.key, Rows: rowNums, Name: name, Slug: g.key, Status: p.status, Existing: match,
			Changes: p.changes, NewSKUs: p.newSKUs, Issues: p.issues,
		}
		if item.Changes == nil {
			item.Changes = []dto.ImportChange{}
		}
		if item.NewSKUs == nil {
			item.NewSKUs = []string{}
		}
		if item.Issues == nil {
			item.Issues = []dto.ImportIssue{}
		}
		out.Products = append(out.Products, item)

		out.Summary.Products++
		switch p.status {
		case "create":
			out.Summary.Create++
		case "update":
			out.Summary.Update++
		case "unchanged":
			out.Summary.Unchanged++
		case "name_match":
			out.Summary.NameMatch++
		case "error":
			out.Summary.Errors++
		}
	}
	return out, plans, nil
}

func (s *productImportService) Preview(ctx context.Context, req dto.ImportRequest) (*dto.ImportPreview, error) {
	out, _, err := s.analyze(ctx, req, nil)
	return out, err
}

// Commit applies the file product by product, following the admin's decisions. Each product
// is saved in its own transaction; products with problems are reported and left untouched.
func (s *productImportService) Commit(ctx context.Context, req dto.ImportCommitRequest, actor repository.Actor) (*dto.ImportResult, error) {
	preview, plans, err := s.analyze(ctx, req.ImportRequest, req.Decisions)
	if err != nil {
		return nil, err
	}
	if len(preview.FileIssues) > 0 {
		return nil, &ValidationError{Fields: map[string]string{"csv": preview.FileIssues[0].Message}}
	}
	res := &dto.ImportResult{Outcomes: []dto.ImportOutcome{}}
	note := "CSV import"
	if f := strings.TrimSpace(req.Filename); f != "" {
		note += ": " + f
	}

	for i, p := range plans {
		item := preview.Products[i]
		out := dto.ImportOutcome{Key: item.Key, Name: item.Name}
		d := req.Decisions[item.Key]
		action := d.Action
		if action == "" {
			action = map[string]string{"create": "create", "update": "update"}[p.status] // name matches need a decision
		}

		// A name match the admin wants as a separate product is resolved again as a create.
		if p.status == "name_match" && action == "create" {
			lk, _, _, err := s.loadLookups(ctx, []*importGroup{p.group})
			if err != nil {
				return nil, err
			}
			p = s.resolve(ctx, p.group, nil, lk, nil)
			if len(p.issues) == 0 {
				p.status = "create"
			} else {
				p.status = "error"
			}
		}

		switch {
		case p.status == "error":
			out.Status, out.Message = "failed", fmt.Sprintf("Row %d: %s", p.issues[0].Row, p.issues[0].Message)
			res.Failed++
		case action == "skip" || action == "":
			out.Status = "skipped"
			res.Skipped++
		case p.status == "unchanged":
			out.Status = "unchanged"
			res.Skipped++
		case p.target == nil:
			created, err := s.admin.CreateProduct(ctx, p.input, actor)
			if err != nil {
				out.Status, out.Message = "failed", err.Error()
				res.Failed++
				break
			}
			out.Status, out.ProductID = "created", &created.ID
			res.Created++
		default:
			if _, err := s.admin.UpdateProduct(ctx, p.target.ID, p.input, actor); err != nil {
				out.Status, out.Message = "failed", err.Error()
				res.Failed++
				break
			}
			for _, st := range p.stock {
				expected := st.current
				if _, err := s.admin.AdjustStock(ctx, st.variantID, dto.StockAdjustmentRequest{
					Mode: "set", Quantity: st.target, Reason: models.StockReasonCount, Note: note, ExpectedStock: &expected,
				}, actor); err != nil {
					out.Message = fmt.Sprintf("Saved, but stock for %s wasn't changed: %v", st.sku, err)
				}
			}
			out.Status, out.ProductID = "updated", &p.target.ID
			res.Updated++
		}
		res.Outcomes = append(res.Outcomes, out)
	}
	return res, nil
}

// Export writes every product in the import layout, so the file can be edited and imported
// back. It starts with a UTF-8 BOM so Excel shows Thai text correctly.
func (s *productImportService) Export(ctx context.Context) ([]byte, error) {
	ids, err := s.lookup.AllProductIDs(ctx)
	if err != nil {
		return nil, err
	}
	cats, err := s.lookup.CategorySlugs(ctx)
	if err != nil {
		return nil, err
	}
	brands, err := s.lookup.BrandSlugs(ctx)
	if err != nil {
		return nil, err
	}
	slugOf := func(m map[string]uuid.UUID, id uuid.UUID) string {
		for slug, v := range m {
			if v == id {
				return slug
			}
		}
		return ""
	}
	baht := func(satang int64) string {
		if satang%100 == 0 {
			return strconv.FormatInt(satang/100, 10)
		}
		return fmt.Sprintf("%d.%02d", satang/100, satang%100)
	}

	var buf strings.Builder
	buf.WriteString(utf8BOM)
	w := csv.NewWriter(&buf)
	header := make([]string, len(ImportColumns))
	for i, c := range ImportColumns {
		header[i] = c.Key
	}
	if err := w.Write(header); err != nil {
		return nil, err
	}
	for _, id := range ids {
		p, err := s.admin.repo.GetProduct(ctx, id)
		if err != nil {
			return nil, err
		}
		var personas []string
		_ = json.Unmarshal(p.UsagePersonas, &personas)
		for _, v := range p.Variants {
			specs := map[string]interface{}{}
			_ = json.Unmarshal(v.Specs, &specs)
			var images []string
			_ = json.Unmarshal(v.Images, &images)
			compare := ""
			if v.ComparePrice > 0 {
				compare = baht(v.ComparePrice)
			}
			row := map[string]string{
				"product_slug": p.Slug, "product_name": p.Name, "category": slugOf(cats, p.CategoryID), "brand": slugOf(brands, p.BrandID),
				"tagline": p.Tagline, "short_description": p.ShortDescription, "use_cases": strings.Join(personas, "|"),
				"on_sale": strings.ToLower(yesNo(p.IsActive)), "sku": v.SKU, "color_name": v.ColorName, "color_hex": v.ColorHex,
				"price": baht(v.Price), "compare_price": compare, "stock": strconv.Itoa(v.StockQuantity), "images": strings.Join(images, "|"),
			}
			for col := range specKinds {
				if b, isBool := specs[col].(bool); isBool {
					row[col] = strings.ToLower(yesNo(b))
				} else {
					row[col] = specText(specs[col])
				}
			}
			rec := make([]string, len(ImportColumns))
			for i, c := range ImportColumns {
				rec[i] = row[c.Key]
			}
			if err := w.Write(rec); err != nil {
				return nil, err
			}
		}
	}
	w.Flush()
	return []byte(buf.String()), w.Error()
}
