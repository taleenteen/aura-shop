package service_test

import (
	"context"
	"testing"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/service"
)

func TestCalculateInstallments(t *testing.T) {
	svc := service.NewCheckoutService(nil, nil)
	amountSatang := int64(5990000) // ฿59,900.00

	options := svc.CalculateInstallments(amountSatang)
	if len(options) != 12 { // 4 banks * 3 tenures (3, 6, 10) = 12
		t.Fatalf("expected 12 installment options, got %d", len(options))
	}

	for _, opt := range options {
		if opt.InterestRate != 0 {
			t.Fatalf("expected 0%% interest rate, got %d", opt.InterestRate)
		}
		expectedMonthly := amountSatang / int64(opt.Months)
		if opt.MonthlyPaySatang != expectedMonthly {
			t.Fatalf("expected monthly satang %d for %d months, got %d", expectedMonthly, opt.Months, opt.MonthlyPaySatang)
		}
	}
}

func TestPaymentProcess_CardDeclinedSimulator(t *testing.T) {
	svc := service.NewCheckoutService(nil, nil)

	req := dto.PaymentProcessRequest{
		OrderNumber:   "AURA-20261104-1001",
		PaymentMethod: "CREDIT_CARD",
		CardNumber:    "4532-1111-2222-0000", // Ends with 0000 to trigger decline
	}

	_, err := svc.ProcessPayment(context.Background(), req)
	if err == nil {
		t.Fatalf("expected card decline error for card ending in 0000")
	}
	if err != service.ErrCardDeclined {
		t.Fatalf("expected ErrCardDeclined, got %v", err)
	}
}
