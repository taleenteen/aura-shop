package repository

import (
	"errors"
	"testing"

	"aura-tech/api/internal/models"

	"github.com/google/uuid"
)

func twoUnitItem(serials ...string) []models.OrderItem {
	return []models.OrderItem{{ID: uuid.New(), SKUSnapshot: "MBA13", Quantity: 2, SerialNumbers: serials}}
}

func TestMergeSerialNumbers(t *testing.T) {
	t.Run("records one serial per unit, normalised", func(t *testing.T) {
		items := twoUnitItem()
		changed, err := mergeSerialNumbers(items, map[string][]string{items[0].ID.String(): {" c02a ", "C02B"}}, true)
		if err != nil || len(changed) != 1 {
			t.Fatalf("changed=%v err=%v", changed, err)
		}
		if got := []string(items[0].SerialNumbers); got[0] != "C02A" || got[1] != "C02B" {
			t.Fatalf("serials %v", got)
		}
		if !allUnitsHaveSerials(items) {
			t.Fatal("expected every unit to have a serial")
		}
	})

	t.Run("blank entry keeps the saved serial", func(t *testing.T) {
		items := twoUnitItem("C02A", "C02B")
		changed, err := mergeSerialNumbers(items, map[string][]string{items[0].ID.String(): {"", "C02X"}}, true)
		if err != nil || len(changed) != 1 {
			t.Fatalf("changed=%v err=%v", changed, err)
		}
		if got := []string(items[0].SerialNumbers); got[0] != "C02A" || got[1] != "C02X" {
			t.Fatalf("serials %v", got)
		}
	})

	t.Run("one unit missing blocks shipping", func(t *testing.T) {
		items := twoUnitItem()
		if _, err := mergeSerialNumbers(items, map[string][]string{items[0].ID.String(): {"C02A"}}, true); err != nil {
			t.Fatal(err)
		}
		if allUnitsHaveSerials(items) {
			t.Fatal("second unit has no serial")
		}
	})

	rejects := map[string]func() ([]models.OrderItem, map[string][]string, bool){
		"unknown item": func() ([]models.OrderItem, map[string][]string, bool) {
			return twoUnitItem(), map[string][]string{uuid.NewString(): {"X"}}, true
		},
		"more serials than units": func() ([]models.OrderItem, map[string][]string, bool) {
			items := twoUnitItem()
			return items, map[string][]string{items[0].ID.String(): {"A", "B", "C"}}, true
		},
		"duplicate serial": func() ([]models.OrderItem, map[string][]string, bool) {
			items := twoUnitItem()
			return items, map[string][]string{items[0].ID.String(): {"SAME", "same"}}, true
		},
		"change after shipping": func() ([]models.OrderItem, map[string][]string, bool) {
			items := twoUnitItem("C02A", "C02B")
			return items, map[string][]string{items[0].ID.String(): {"NEW"}}, false
		},
	}
	for name, setup := range rejects {
		t.Run("rejects "+name, func(t *testing.T) {
			items, input, editable := setup()
			if _, err := mergeSerialNumbers(items, input, editable); !errors.Is(err, ErrInvalidSerialNumbers) {
				t.Fatalf("want ErrInvalidSerialNumbers, got %v", err)
			}
		})
	}

	t.Run("resending saved serials after shipping is a no-op", func(t *testing.T) {
		items := twoUnitItem("C02A", "C02B")
		changed, err := mergeSerialNumbers(items, map[string][]string{items[0].ID.String(): {"C02A", ""}}, false)
		if err != nil || len(changed) != 0 {
			t.Fatalf("changed=%v err=%v", changed, err)
		}
	})
}
