package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"

	"gorm.io/gorm"
)

// facetGroup names one filter group. Facet counts for a group are computed with every active
// filter applied except that group's own ("disjunctive faceting"): inside Ultrabooks only
// Ultrabook CPUs are listed, and picking one brand still shows the other brands' counts so the
// shopper can switch without clearing anything. Category is never a facet here; it always applies.
type facetGroup int

const (
	groupNone facetGroup = iota
	groupBrand
	groupPersona
	groupPrice
	groupCPU
	groupRAM
	groupStorage
)

// Spec facets (CPU, RAM, storage) describe computers. Accessories and monitors carry placeholder
// specs (ram_gb = 0, an MCU name as cpu_family), so only variants with RAM count toward them.
const computerVariant = "(%[1]s.specs->>'ram_gb')::int > 0"

var personaLabels = []struct{ Value, Label string }{
	{"CREATOR", "Creator (Video & 3D)"},
	{"GAMING", "High-FPS Gaming"},
	{"ULTRALIGHT", "Ultralight (< 1.3 kg)"},
	{"OFFICE", "Office & Productivity"},
}

// variantConds returns the variant-level filters (CPU, RAM, storage) for table alias a,
// leaving out the skipped group.
func variantConds(f dto.CatalogFilter, skip facetGroup, a string) ([]string, []interface{}) {
	var conds []string
	var args []interface{}
	if f.CPU != "" && skip != groupCPU {
		conds = append(conds, fmt.Sprintf("LOWER(%s.specs->>'cpu_family') = LOWER(?)", a))
		args = append(args, f.CPU)
	}
	if f.RAM > 0 && skip != groupRAM {
		conds = append(conds, fmt.Sprintf("(%s.specs->>'ram_gb')::int = ?", a))
		args = append(args, f.RAM)
	}
	if f.Storage > 0 && skip != groupStorage {
		conds = append(conds, fmt.Sprintf("(%s.specs->>'storage_gb')::int = ?", a))
		args = append(args, f.Storage)
	}
	return conds, args
}

// productScope selects active products matching every filter except the skipped group.
// With withVariants, a product must also have one variant satisfying all remaining
// variant-level filters at once (the same configuration has that CPU, RAM and storage).
func (r *catalogRepository) productScope(ctx context.Context, f dto.CatalogFilter, skip facetGroup, withVariants bool) *gorm.DB {
	q := r.db.WithContext(ctx).Model(&models.Product{}).
		Joins("JOIN categories ON categories.id = products.category_id").
		Joins("JOIN brands ON brands.id = products.brand_id").
		Where("products.is_active = ?", true)

	if f.Category != "" {
		q = q.Where("categories.slug = ?", strings.ToLower(f.Category))
	}
	if f.Brand != "" && skip != groupBrand {
		q = q.Where("brands.slug = ?", strings.ToLower(f.Brand))
	}
	if f.Persona != "" && skip != groupPersona {
		personaJSON, _ := json.Marshal([]string{strings.ToUpper(f.Persona)})
		q = q.Where("products.usage_personas @> ?", string(personaJSON))
	}
	if skip != groupPrice {
		if f.MinPrice > 0 {
			q = q.Where("products.base_price >= ?", f.MinPrice)
		}
		if f.MaxPrice > 0 {
			q = q.Where("products.base_price <= ?", f.MaxPrice)
		}
	}
	if withVariants {
		if conds, args := variantConds(f, skip, "fv"); len(conds) > 0 {
			q = q.Where("EXISTS (SELECT 1 FROM product_variants fv WHERE fv.product_id = products.id AND "+
				strings.Join(conds, " AND ")+")", args...)
		}
	}
	return q
}

type facetRow struct {
	Value string
	Label string
	Count int64
}

// buildOptions turns counted rows into facet options. The currently selected value is always
// included, even with no matches, so the shopper can see it and untick it; other zero-count
// values are simply absent.
func buildOptions(rows []facetRow, selected string, label func(string) string) []dto.FacetOption {
	opts := make([]dto.FacetOption, 0, len(rows)+1)
	found := false
	for _, row := range rows {
		if row.Count == 0 && !strings.EqualFold(row.Value, selected) {
			continue
		}
		if strings.EqualFold(row.Value, selected) {
			found = true
		}
		l := row.Label
		if l == "" {
			l = label(row.Value)
		}
		opts = append(opts, dto.FacetOption{Value: row.Value, Label: l, Count: row.Count})
	}
	if selected != "" && !found {
		opts = append(opts, dto.FacetOption{Value: selected, Label: label(selected), Count: 0})
	}
	return opts
}

func storageLabel(v string) string {
	gb, err := strconv.Atoi(v)
	if err != nil {
		return v
	}
	if gb >= 1024 && gb%1024 == 0 {
		return fmt.Sprintf("%dTB", gb/1024)
	}
	return fmt.Sprintf("%dGB", gb)
}

func intString(n int) string {
	if n <= 0 {
		return ""
	}
	return strconv.Itoa(n)
}

// specFacet counts products per value of one variant spec, among products matching every
// other filter, using only computer variants that also satisfy the other spec filters.
func (r *catalogRepository) specFacet(ctx context.Context, f dto.CatalogFilter, group facetGroup, expr string) ([]facetRow, error) {
	conds, args := variantConds(f, group, "pv")
	conds = append(conds, fmt.Sprintf(computerVariant, "pv"), expr+" IS NOT NULL", expr+" <> ''")
	var rows []facetRow
	err := r.productScope(ctx, f, group, false).
		Joins("JOIN product_variants pv ON pv.product_id = products.id").
		Where(strings.Join(conds, " AND "), args...).
		Select(expr + " AS value, COUNT(DISTINCT products.id) AS count").
		Group(expr).
		Scan(&rows).Error
	return rows, err
}

func (r *catalogRepository) calculateFacets(ctx context.Context, f dto.CatalogFilter) (*dto.FacetCounts, error) {
	facets := &dto.FacetCounts{}

	// Personas: fixed vocabulary in a fixed order.
	var personaRows []facetRow
	if err := r.productScope(ctx, f, groupPersona, true).
		Joins("CROSS JOIN LATERAL jsonb_array_elements_text(products.usage_personas) AS persona(value)").
		Select("persona.value AS value, COUNT(DISTINCT products.id) AS count").
		Group("persona.value").
		Scan(&personaRows).Error; err != nil {
		return nil, fmt.Errorf("persona facet: %w", err)
	}
	counts := make(map[string]int64, len(personaRows))
	for _, row := range personaRows {
		counts[row.Value] = row.Count
	}
	ordered := make([]facetRow, 0, len(personaLabels))
	labelOf := map[string]string{}
	for _, p := range personaLabels {
		ordered = append(ordered, facetRow{Value: p.Value, Label: p.Label, Count: counts[p.Value]})
		labelOf[p.Value] = p.Label
	}
	facets.Personas = buildOptions(ordered, strings.ToUpper(f.Persona), func(v string) string {
		if l, ok := labelOf[strings.ToUpper(v)]; ok {
			return l
		}
		return v
	})

	// Brands.
	var brandRows []facetRow
	if err := r.productScope(ctx, f, groupBrand, true).
		Select("brands.slug AS value, brands.name AS label, COUNT(DISTINCT products.id) AS count").
		Group("brands.slug, brands.name").
		Order("brands.name ASC").
		Scan(&brandRows).Error; err != nil {
		return nil, fmt.Errorf("brand facet: %w", err)
	}
	facets.Brands = buildOptions(brandRows, strings.ToLower(f.Brand), func(v string) string { return v })

	// Processor family, alphabetical.
	cpuRows, err := r.specFacet(ctx, f, groupCPU, "pv.specs->>'cpu_family'")
	if err != nil {
		return nil, fmt.Errorf("cpu facet: %w", err)
	}
	sort.Slice(cpuRows, func(i, j int) bool { return cpuRows[i].Value < cpuRows[j].Value })
	facets.CPUFamily = buildOptions(cpuRows, f.CPU, func(v string) string { return v })

	// RAM and storage, smallest first.
	numeric := func(rows []facetRow) {
		sort.Slice(rows, func(i, j int) bool {
			a, _ := strconv.Atoi(rows[i].Value)
			b, _ := strconv.Atoi(rows[j].Value)
			return a < b
		})
	}
	ramRows, err := r.specFacet(ctx, f, groupRAM, "pv.specs->>'ram_gb'")
	if err != nil {
		return nil, fmt.Errorf("ram facet: %w", err)
	}
	numeric(ramRows)
	facets.RAM = buildOptions(ramRows, intString(f.RAM), func(v string) string { return v + "GB" })

	storageRows, err := r.specFacet(ctx, f, groupStorage, "pv.specs->>'storage_gb'")
	if err != nil {
		return nil, fmt.Errorf("storage facet: %w", err)
	}
	storageRows = dropZero(storageRows)
	numeric(storageRows)
	facets.Storage = buildOptions(storageRows, intString(f.Storage), storageLabel)

	// Price bounds of what the other filters leave.
	var price struct{ MinPrice, MaxPrice int64 }
	if err := r.productScope(ctx, f, groupPrice, true).
		Select("COALESCE(MIN(products.base_price), 0) AS min_price, COALESCE(MAX(products.base_price), 0) AS max_price").
		Scan(&price).Error; err != nil {
		return nil, fmt.Errorf("price facet: %w", err)
	}
	facets.PriceRange.MinSatang, facets.PriceRange.MaxSatang = price.MinPrice, price.MaxPrice

	return facets, nil
}

func dropZero(rows []facetRow) []facetRow {
	out := rows[:0]
	for _, row := range rows {
		if row.Value != "0" {
			out = append(out, row)
		}
	}
	return out
}
