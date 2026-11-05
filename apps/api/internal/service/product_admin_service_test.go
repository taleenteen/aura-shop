package service

import (
	"context"
	"errors"
	"testing"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

type fakeProductRepo struct {
	repository.ProductAdminRepository
	takenSlug string
	takenSKUs []string
	created   *models.Product
	stock     []int
}

func (f *fakeProductRepo) CategoryExists(context.Context, uuid.UUID) (bool, error) { return true, nil }
func (f *fakeProductRepo) BrandExists(context.Context, uuid.UUID) (bool, error)    { return true, nil }
func (f *fakeProductRepo) SlugTaken(_ context.Context, slug string, _ *uuid.UUID) (bool, error) {
	return slug == f.takenSlug, nil
}
func (f *fakeProductRepo) SKUsTaken(_ context.Context, skus []string, _ *uuid.UUID) ([]string, error) {
	var out []string
	for _, s := range skus {
		for _, t := range f.takenSKUs {
			if s == t {
				out = append(out, s)
			}
		}
	}
	return out, nil
}
func (f *fakeProductRepo) CreateProduct(_ context.Context, p *models.Product, stock []int, _ repository.Actor) error {
	p.ID = uuid.New()
	f.created, f.stock = p, stock
	return nil
}
func (f *fakeProductRepo) GetProduct(context.Context, uuid.UUID) (*models.Product, error) {
	return &models.Product{}, nil
}

func validInput() dto.ProductInput {
	return dto.ProductInput{
		Name: "Aura Book 14 (2026)", CategoryID: uuid.New(), BrandID: uuid.New(),
		UsagePersonas: []string{"office", "OFFICE", "creator"}, IsActive: true,
		Variants: []dto.VariantInput{
			{SKU: "ab14-16-512", ColorName: "Graphite", ColorHex: "#333333", Price: 3990000, InitialStock: 5,
				Specs: map[string]interface{}{"cpu_family": " Intel Core Ultra 7 ", "ram_gb": float64(16), "storage_gb": float64(512)}},
			{SKU: "AB14-32-1TB", ColorName: "Silver", ColorHex: "#c0c0c0", Price: 4990000, ComparePrice: 5290000},
		},
	}
}

func fieldsOf(t *testing.T, err error) map[string]string {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError, got %v", err)
	}
	return ve.Fields
}

func TestCreateProductNormalises(t *testing.T) {
	repo := &fakeProductRepo{}
	svc := NewProductAdminService(repo)
	if _, err := svc.CreateProduct(context.Background(), validInput(), repository.Actor{}); err != nil {
		t.Fatal(err)
	}
	p := repo.created
	if p.Slug != "aura-book-14-2026" {
		t.Errorf("slug %q", p.Slug)
	}
	if p.BasePrice != 3990000 {
		t.Errorf("base price should be the cheapest variant, got %d", p.BasePrice)
	}
	if string(p.UsagePersonas) != `["OFFICE","CREATOR"]` {
		t.Errorf("personas %s", p.UsagePersonas)
	}
	if p.Variants[0].SKU != "AB14-16-512" || p.Variants[1].ColorHex != "#C0C0C0" {
		t.Errorf("sku/hex not normalised: %s %s", p.Variants[0].SKU, p.Variants[1].ColorHex)
	}
	if string(p.Variants[0].Specs) != `{"cpu_family":"Intel Core Ultra 7","ram_gb":16,"storage_gb":512}` {
		t.Errorf("specs %s", p.Variants[0].Specs)
	}
	if repo.stock[0] != 5 || repo.stock[1] != 0 {
		t.Errorf("opening stock %v", repo.stock)
	}
	if string(p.PortsDiagram) != `{"left_ports":[],"right_ports":[]}` || string(p.BoxContents) != "[]" {
		t.Errorf("empty content defaults: %s %s", p.PortsDiagram, p.BoxContents)
	}
}

func TestCreateProductReportsEveryProblem(t *testing.T) {
	repo := &fakeProductRepo{takenSlug: "taken", takenSKUs: []string{"AB14-32-1TB"}}
	svc := NewProductAdminService(repo)
	in := validInput()
	in.Slug = "taken"
	in.UsagePersonas = []string{"PILOT"}
	in.BoxContents = []byte(`{"not":"a list"}`)
	in.Variants[0].SKU = "AB14-32-1TB"    // duplicate of variant 2 within the request
	in.Variants[0].ComparePrice = 3990000 // not above price
	in.Variants[0].Specs["ram_gb"] = 16.5 // not whole
	in.Variants[1].ColorHex = "silver"    // not hex
	in.Variants[1].Images = []string{"javascript:alert(1)"}

	_, err := svc.CreateProduct(context.Background(), in, repository.Actor{})
	f := fieldsOf(t, err)
	for _, key := range []string{"slug", "usage_personas", "box_contents", "variants.1.sku", "variants.0.compare_price",
		"variants.0.specs", "variants.1.color_hex", "variants.1.images"} {
		if f[key] == "" {
			t.Errorf("expected a message for %s; got %v", key, f)
		}
	}
	if repo.created != nil {
		t.Fatal("nothing should be saved when validation fails")
	}
}

func TestAdjustStockValidation(t *testing.T) {
	svc := NewProductAdminService(&fakeProductRepo{})
	cases := map[string]dto.StockAdjustmentRequest{
		"quantity": {Mode: "delta", Quantity: 0, Reason: "RECEIVE"},
		"reason":   {Mode: "delta", Quantity: 2, Reason: "SALE"}, // system-only reason
		"note":     {Mode: "set", Quantity: 4, Reason: "COUNT"},  // corrections need a note
		"mode":     {Mode: "replace", Quantity: 4, Reason: "RECEIVE"},
	}
	for field, req := range cases {
		_, err := svc.AdjustStock(context.Background(), uuid.New(), req, repository.Actor{})
		if f := fieldsOf(t, err); f[field] == "" {
			t.Errorf("%s: expected a message, got %v", field, f)
		}
	}
}

func TestSlugify(t *testing.T) {
	for in, want := range map[string]string{
		`MacBook Air 13" (M3)`: "macbook-air-13-m3",
		"  ROG -- Zephyrus  ":  "rog-zephyrus",
		"ไทย":                  "",
	} {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
