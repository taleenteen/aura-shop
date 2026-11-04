package service

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

var (
	ErrEmptyCart                 = errors.New("cannot checkout with an empty cart")
	ErrCardDeclined              = errors.New("CARD_DECLINED_INSUFFICIENT_FUNDS")
	ErrInvalidInstallmentPlan    = errors.New("invalid installment bank or tenure")
	ErrUnsupportedPaymentMethod  = errors.New("unsupported payment method")
)

type CheckoutService interface {
	CreateReservation(ctx context.Context, userID *uuid.UUID, guestID *string, req dto.CheckoutReserveRequest) (*dto.CheckoutReserveResponse, error)
	ProcessPayment(ctx context.Context, req dto.PaymentProcessRequest) (*models.Order, error)
	GeneratePromptPayQR(ctx context.Context, orderNumber string) (*dto.PromptPayQRResponse, error)
	GetOrderByNumber(ctx context.Context, orderNumber string) (*models.Order, error)
	CalculateInstallments(satangAmount int64) []dto.InstallmentCalculationOption
}

type checkoutService struct {
	orderRepo repository.OrderRepository
	cartRepo  repository.CartRepository
}

func NewCheckoutService(orderRepo repository.OrderRepository, cartRepo repository.CartRepository) CheckoutService {
	return &checkoutService{
		orderRepo: orderRepo,
		cartRepo:  cartRepo,
	}
}

func (s *checkoutService) CreateReservation(ctx context.Context, userID *uuid.UUID, guestID *string, req dto.CheckoutReserveRequest) (*dto.CheckoutReserveResponse, error) {
	cartItems, err := s.cartRepo.GetCart(ctx, userID, guestID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch cart: %w", err)
	}
	if len(cartItems) == 0 {
		return nil, ErrEmptyCart
	}

	// Generate Order Number: AURA-YYYYMMDD-XXXX
	n, _ := rand.Int(rand.Reader, big.NewInt(9000))
	randNum := n.Int64() + 1000
	orderNumber := fmt.Sprintf("AURA-%s-%04d", time.Now().Format("20060102"), randNum)

	var subtotal int64
	var orderItems []models.OrderItem
	var reservations []models.StockReservation

	expiresAt := time.Now().Add(15 * time.Minute)

	for _, item := range cartItems {
		itemPrice := item.Variant.Price
		lineTotal := itemPrice * int64(item.Quantity)
		subtotal += lineTotal

		specSummary := fmt.Sprintf("%s / %s", item.Variant.ColorName, item.Variant.SKU)
		nameSnapshot := item.Variant.SKU
		if item.Variant.Product != nil {
			nameSnapshot = item.Variant.Product.Name
		}

		orderItems = append(orderItems, models.OrderItem{
			VariantID:    item.VariantID,
			SKUSnapshot:  item.Variant.SKU,
			NameSnapshot: nameSnapshot,
			SpecSummary:  specSummary,
			UnitPrice:    itemPrice,
			Quantity:     item.Quantity,
			SerialNumber: "", // Empty at creation; assigned by admin prior to SHIPPED
		})

		reservations = append(reservations, models.StockReservation{
			VariantID: item.VariantID,
			Quantity:  item.Quantity,
			ExpiresAt: expiresAt,
			Status:    "ACTIVE",
		})
	}

	shippingJSON, _ := json.Marshal(req.ShippingAddress)
	var installmentJSON datatypes.JSON
	if req.InstallmentPlan != nil {
		installmentJSON, _ = json.Marshal(req.InstallmentPlan)
	}

	order := &models.Order{
		OrderNumber:          orderNumber,
		UserID:               userID,
		GuestSessionID:       guestID,
		CustomerEmail:        req.CustomerEmail,
		Status:               "PENDING_PAYMENT",
		SubtotalAmount:       subtotal,
		DiscountAmount:       0,
		GrandTotal:           subtotal,
		ShippingAddress:      datatypes.JSON(shippingJSON),
		PaymentMethod:        req.PaymentMethod,
		InstallmentPlan:      installmentJSON,
		ReservationExpiresAt: expiresAt,
	}

	if err := s.orderRepo.CreateReservationAtomic(ctx, order, orderItems, reservations); err != nil {
		return nil, err
	}

	return &dto.CheckoutReserveResponse{
		OrderNumber:          order.OrderNumber,
		ReservationExpiresAt: order.ReservationExpiresAt,
		GrandTotalSatang:     order.GrandTotal,
		PaymentMethod:        order.PaymentMethod,
	}, nil
}

func (s *checkoutService) ProcessPayment(ctx context.Context, req dto.PaymentProcessRequest) (*models.Order, error) {
	method := strings.ToUpper(strings.TrimSpace(req.PaymentMethod))

	switch method {
	case "CREDIT_CARD":
		// Card Validation & Decline Simulator
		cleanCard := strings.ReplaceAll(req.CardNumber, " ", "")
		cleanCard = strings.ReplaceAll(cleanCard, "-", "")
		if strings.HasSuffix(cleanCard, "0000") {
			// Specific simulation: Keep the reservation alive, report CARD_DECLINED_INSUFFICIENT_FUNDS
			return nil, ErrCardDeclined
		}

	case "PROMPTPAY_QR":
		// PromptPay QR success processing

	case "INSTALLMENT_0":
		if req.InstallmentPlan == nil {
			return nil, ErrInvalidInstallmentPlan
		}
		// Validate bank code
		bank := strings.ToUpper(req.InstallmentPlan.BankCode)
		if bank != "KBANK" && bank != "SCB" && bank != "KRUNGSRI" && bank != "BBL" {
			return nil, ErrInvalidInstallmentPlan
		}
		// Validate tenure
		months := req.InstallmentPlan.Months
		if months != 3 && months != 6 && months != 10 {
			return nil, ErrInvalidInstallmentPlan
		}

	default:
		return nil, ErrUnsupportedPaymentMethod
	}

	var installmentJSON datatypes.JSON
	if req.InstallmentPlan != nil {
		b, _ := json.Marshal(req.InstallmentPlan)
		installmentJSON = datatypes.JSON(b)
	}

	order, err := s.orderRepo.CommitReservationAndPay(ctx, req.OrderNumber, method, installmentJSON)
	if err != nil {
		return nil, err
	}

	return order, nil
}

func (s *checkoutService) GeneratePromptPayQR(ctx context.Context, orderNumber string) (*dto.PromptPayQRResponse, error) {
	order, err := s.orderRepo.GetOrderByNumber(ctx, orderNumber)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, repository.ErrOrderNotFound
	}

	// Thai PromptPay EMVCo Standard Mock Payload
	thbAmount := float64(order.GrandTotal) / 100.0
	payload := fmt.Sprintf("00020101021229370016A000000677010111011300668123456785802TH530376454%05.2f6304ABCD", thbAmount)

	return &dto.PromptPayQRResponse{
		OrderNumber:      order.OrderNumber,
		GrandTotalSatang: order.GrandTotal,
		PromptPayPayload: payload,
		QRCodeDataURL:    fmt.Sprintf("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='black'/><rect x='10' y='10' width='80' height='80' fill='white'/><text x='50' y='55' font-size='8' text-anchor='middle' fill='black'>PromptPay ฿%.2f</text></svg>", thbAmount),
	}, nil
}

func (s *checkoutService) GetOrderByNumber(ctx context.Context, orderNumber string) (*models.Order, error) {
	order, err := s.orderRepo.GetOrderByNumber(ctx, orderNumber)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, repository.ErrOrderNotFound
	}
	return order, nil
}

func (s *checkoutService) CalculateInstallments(satangAmount int64) []dto.InstallmentCalculationOption {
	banks := []struct {
		Code string
		Name string
	}{
		{"KBANK", "Kasikornbank (K-Bank)"},
		{"SCB", "Siam Commercial Bank (SCB)"},
		{"KRUNGSRI", "Bank of Ayudhya (Krungsri)"},
		{"BBL", "Bangkok Bank (BBL)"},
	}

	tenures := []int{3, 6, 10}
	var options []dto.InstallmentCalculationOption

	for _, bank := range banks {
		for _, months := range tenures {
			monthlySatang := satangAmount / int64(months)
			options = append(options, dto.InstallmentCalculationOption{
				BankCode:         bank.Code,
				BankName:         bank.Name,
				Months:           months,
				InterestRate:     0,
				MonthlyPaySatang: monthlySatang,
			})
		}
	}

	return options
}
