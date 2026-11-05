package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"time"

	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

// AuditEntry is one admin change to record.
type AuditEntry struct {
	Action      string // e.g. "product.update"
	EntityType  string // product, variant, order, banner, category, brand, review, import
	EntityID    string
	EntityLabel string
	Changes     []models.AuditChange
}

// AuditService records admin changes and lists them.
type AuditService interface {
	// Record writes an entry. It never fails the caller: the change it describes has already
	// been saved, so a failure is logged instead.
	Record(ctx context.Context, actor repository.Actor, e AuditEntry)
	List(ctx context.Context, f repository.AuditFilter) ([]models.AuditLog, int64, error)
}

type auditService struct {
	repo repository.AuditRepository
}

func NewAuditService(repo repository.AuditRepository) AuditService {
	return &auditService{repo: repo}
}

func (s *auditService) Record(ctx context.Context, actor repository.Actor, e AuditEntry) {
	if e.Changes == nil {
		e.Changes = []models.AuditChange{}
	}
	changes, _ := json.Marshal(e.Changes)
	entry := &models.AuditLog{
		ActorEmail: actor.Email, Action: e.Action, EntityType: e.EntityType,
		EntityID: e.EntityID, EntityLabel: truncate(e.EntityLabel, 255), Changes: changes,
	}
	if actor.ID != uuid.Nil {
		id := actor.ID
		entry.ActorID = &id
	}
	// Detached from the request: a client that disconnects must not lose the record.
	if err := s.repo.Create(context.WithoutCancel(ctx), entry); err != nil {
		slog.Error("audit log write failed", "action", e.Action, "entity", e.EntityID, "error", err)
	}
}

func (s *auditService) List(ctx context.Context, f repository.AuditFilter) ([]models.AuditLog, int64, error) {
	rows, total, err := s.repo.List(ctx, f)
	if rows == nil && err == nil {
		rows = []models.AuditLog{}
	}
	return rows, total, err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	r := []rune(s)
	for len(string(r)) > n {
		r = r[:len(r)-1]
	}
	return string(r)
}

// ---------------------------------------------------------------- diffs

// Snapshot is a record flattened to readable field values, for diffing.
type Snapshot map[string]string

// Diff lists the fields whose values differ, in field order. A nil before means a new record
// (every non-empty field is listed); a nil after means a deleted one.
func Diff(before, after Snapshot) []models.AuditChange {
	keys := map[string]bool{}
	for k := range before {
		keys[k] = true
	}
	for k := range after {
		keys[k] = true
	}
	sorted := make([]string, 0, len(keys))
	for k := range keys {
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)
	var out []models.AuditChange
	for _, k := range sorted {
		if before[k] != after[k] {
			out = append(out, models.AuditChange{Field: k, From: before[k], To: after[k]})
		}
	}
	return out
}

func baht(satang int64) string { return formatBaht(satang) }

func jsonList(raw []byte) string {
	var list []string
	if json.Unmarshal(raw, &list) != nil {
		return ""
	}
	return strings.Join(list, ", ")
}

// ProductSnapshot covers the product fields and, per option (by SKU), price, colour, specs
// and images. Long content sections are compared as a whole.
func ProductSnapshot(p *models.Product) Snapshot {
	if p == nil {
		return nil
	}
	s := Snapshot{
		"name": p.Name, "slug": p.Slug, "category": p.Category.Name, "brand": p.Brand.Name,
		"tagline": p.Tagline, "short_description": p.ShortDescription,
		"use_cases": jsonList(p.UsagePersonas), "on_sale": yesNo(p.IsActive),
	}
	if s["category"] == "" {
		s["category"] = p.CategoryID.String()
	}
	if s["brand"] == "" {
		s["brand"] = p.BrandID.String()
	}
	for _, section := range []struct {
		key string
		raw []byte
	}{{"highlights", p.BentoHighlights}, {"box_contents", p.BoxContents}, {"ports", p.PortsDiagram}, {"spec_table", p.FullSpecMatrix}} {
		s[section.key] = contentDigest(section.raw)
	}
	for _, v := range p.Variants {
		pre := v.SKU + "."
		s[pre+"option"] = v.ColorName
		s[pre+"colour_hex"] = v.ColorHex
		s[pre+"price"] = baht(v.Price)
		if v.ComparePrice > 0 {
			s[pre+"compare_price"] = baht(v.ComparePrice)
		}
		s[pre+"images"] = strconv.Itoa(len(jsonArray(v.Images))) + " image(s)"
		specs := map[string]interface{}{}
		_ = json.Unmarshal(v.Specs, &specs)
		for k, val := range specs {
			if t := specText(val); t != "" && t != "0" {
				s[pre+k] = t
			}
		}
	}
	return s
}

// contentDigest summarises a JSON content section so edits show as "changed" without
// dumping the whole document into the log.
func contentDigest(raw []byte) string {
	n := len(jsonArray(raw))
	if n == 0 {
		var obj map[string]interface{}
		if json.Unmarshal(raw, &obj) == nil && len(obj) > 0 {
			b, _ := json.Marshal(obj)
			return strconv.Itoa(len(b)) + " bytes"
		}
		return ""
	}
	b, _ := json.Marshal(json.RawMessage(raw))
	return strconv.Itoa(n) + " item(s), " + strconv.Itoa(len(b)) + " bytes"
}

func jsonArray(raw []byte) []interface{} {
	var list []interface{}
	_ = json.Unmarshal(raw, &list)
	return list
}

func BannerSnapshot(b *models.Banner) Snapshot {
	if b == nil {
		return nil
	}
	return Snapshot{
		"placement": b.Placement, "headline": b.Headline, "badge": b.BadgeText, "subheadline": b.Subheadline,
		"image": b.ProductImageURL, "background": b.BackgroundColor, "text_colour": b.ThemeMode, "tile_size": b.GridSpan,
		"button_text": b.CTAPrimaryText, "button_link": b.CTAPrimaryLink,
		"second_button_text": b.CTASecondaryText, "second_button_link": b.CTASecondaryLink,
		"order": strconv.Itoa(b.SortOrder), "on": yesNo(b.IsActive),
		"starts": b.StartAt.In(reportZone).Format("2006-01-02 15:04"), "ends": b.EndAt.In(reportZone).Format("2006-01-02 15:04"),
	}
}

func CategorySnapshot(c *models.Category) Snapshot {
	if c == nil {
		return nil
	}
	return Snapshot{"name": c.Name, "slug": c.Slug, "menu_label": c.NavLabel, "icon": c.IconName, "order": strconv.Itoa(c.SortOrder)}
}

func BrandSnapshot(b *models.Brand) Snapshot {
	if b == nil {
		return nil
	}
	return Snapshot{"name": b.Name, "slug": b.Slug, "logo": b.LogoURL}
}

// reportZone is the store's time zone (Thailand, no DST) for dates shown in logs and reports.
var reportZone = time.FixedZone("ICT", 7*60*60)
