package repository

import (
	"errors"
	"testing"

	"aura-tech/api/internal/models"
)

func TestNormalizeShipment(t *testing.T) {
	carrier, tracking, err := normalizeShipment(models.Shipment{Carrier: " kerry ", TrackingNumber: "ke 1234-5678"})
	if err != nil || carrier != "KERRY" || tracking != "KE1234-5678" {
		t.Fatalf("got %q %q %v", carrier, tracking, err)
	}
	for _, bad := range []models.Shipment{
		{Carrier: "UPS", TrackingNumber: "ABC12345"},
		{Carrier: "DHL", TrackingNumber: "12345"},
		{Carrier: "FLASH", TrackingNumber: "TH#12345678"},
	} {
		if _, _, err := normalizeShipment(bad); !errors.Is(err, ErrShipmentRequired) {
			t.Errorf("%+v: want ErrShipmentRequired, got %v", bad, err)
		}
	}
}
