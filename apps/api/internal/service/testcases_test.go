package service_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/service"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Mock Order & Cart Repo for Concurrent Soft-Lock Test (TC-07)
type mockConcurrentOrderRepo struct {
	mu           sync.Mutex
	stock        int
	reserved     int
	reservations map[string]*models.StockReservation
}

func (m *mockConcurrentOrderRepo) CreateReservationAtomic(
	ctx context.Context,
	order *models.Order,
	items []models.OrderItem,
	reservations []models.StockReservation,
) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, res := range reservations {
		available := m.stock - m.reserved
		if available < res.Quantity {
			return errors.New("insufficient stock for SKU: requested exceeds available")
		}
		m.reserved += res.Quantity
		m.reservations[order.OrderNumber] = &models.StockReservation{
			OrderID:   order.ID,
			VariantID: res.VariantID,
			Quantity:  res.Quantity,
			ExpiresAt: res.ExpiresAt,
			Status:    "ACTIVE",
		}
	}
	return nil
}

func (m *mockConcurrentOrderRepo) CommitReservationAndPay(
	ctx context.Context,
	orderNumber string,
	paymentMethod string,
	installmentJSON datatypes.JSON,
) (*models.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	res, ok := m.reservations[orderNumber]
	if !ok || res.Status != "ACTIVE" {
		return nil, repository.ErrOrderNotFound
	}

	m.stock -= res.Quantity
	m.reserved -= res.Quantity
	res.Status = "COMMITTED"

	return &models.Order{
		OrderNumber:   orderNumber,
		Status:        "PAID_PROCESSING",
		PaymentMethod: paymentMethod,
	}, nil
}

func (m *mockConcurrentOrderRepo) ReleaseExpiredReservations(ctx context.Context) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var released int64
	for _, res := range m.reservations {
		if res.Status == "ACTIVE" {
			m.reserved -= res.Quantity
			res.Status = "RELEASED"
			released++
		}
	}
	return released, nil
}

func (m *mockConcurrentOrderRepo) GetOrderByNumber(ctx context.Context, orderNumber string) (*models.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.reservations[orderNumber]; ok {
		return &models.Order{
			OrderNumber:          orderNumber,
			Status:               "PENDING_PAYMENT",
			GrandTotal:           9490000,
			ReservationExpiresAt: time.Now().Add(15 * time.Minute),
		}, nil
	}
	return nil, repository.ErrOrderNotFound
}

func (m *mockConcurrentOrderRepo) GetOrderByID(ctx context.Context, id uuid.UUID) (*models.Order, error) {
	return nil, nil
}

func (m *mockConcurrentOrderRepo) ListOrders(ctx context.Context, filter dto.OrderListFilter) ([]models.Order, int64, error) {
	return []models.Order{}, 0, nil
}

func (m *mockConcurrentOrderRepo) UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, newStatus string, serialNumbers map[string][]string) error {
	return nil
}

func (m *mockConcurrentOrderRepo) GetAdminOverview(ctx context.Context) (*dto.AdminOverviewStats, error) {
	return &dto.AdminOverviewStats{}, nil
}

type mockCartRepo struct {
	variant models.ProductVariant
}

func (m *mockCartRepo) GetCart(ctx context.Context, userID *uuid.UUID, guestID *string) ([]models.CartItem, error) {
	return []models.CartItem{
		{
			VariantID: m.variant.ID,
			Variant:   m.variant,
			Quantity:  1,
		},
	}, nil
}

func (m *mockCartRepo) AddToCart(ctx context.Context, userID *uuid.UUID, guestID *string, variantID uuid.UUID, quantity int) (*models.CartItem, error) {
	return nil, nil
}
func (m *mockCartRepo) UpdateCartItemQuantity(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID, quantity int) error {
	return nil
}
func (m *mockCartRepo) RemoveCartItem(ctx context.Context, userID *uuid.UUID, guestID *string, itemID uuid.UUID) error {
	return nil
}
func (m *mockCartRepo) ClearCart(ctx context.Context, tx *gorm.DB, userID *uuid.UUID, guestID *string) error {
	return nil
}
func (m *mockCartRepo) MergeGuestCart(ctx context.Context, tx *gorm.DB, guestID string, userID uuid.UUID) error {
	return nil
}

// TC-07: Concurrency Soft-Lock Reservation Test
func TestTC07_AtomicSoftLock_Concurrency(t *testing.T) {
	targetVariant := models.ProductVariant{
		ID:            uuid.New(),
		SKU:           "MBP14-M4P-48-1TB-SB",
		StockQuantity: 1, // Only 1 physical unit in stock!
		ReservedStock: 0,
		Price:         9490000,
	}

	orderRepo := &mockConcurrentOrderRepo{
		stock:        1,
		reserved:     0,
		reservations: make(map[string]*models.StockReservation),
	}

	cartRepo := &mockCartRepo{variant: targetVariant}
	checkoutSvc := service.NewCheckoutService(orderRepo, cartRepo)

	// User A and User B attempt to reserve the 1 remaining unit simultaneously
	var wg sync.WaitGroup
	var successCount int64
	var failureCount int64

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			guestID := uuid.New().String()
			req := dto.CheckoutReserveRequest{
				CustomerEmail: "customer@auratech.co.th",
				ShippingAddress: dto.ShippingAddressDTO{
					RecipientName: "Customer",
					Phone:         "0812345678",
					AddressLine1:  "Thonglor",
					PostalCode:    "10110",
				},
				PaymentMethod: "PROMPTPAY_QR",
			}

			_, err := checkoutSvc.CreateReservation(context.Background(), nil, &guestID, req)
			if err == nil {
				atomic.AddInt64(&successCount, 1)
			} else {
				atomic.AddInt64(&failureCount, 1)
			}
		}(i)
	}

	wg.Wait()

	if successCount != 1 {
		t.Fatalf("expected exactly 1 successful reservation, got %d", successCount)
	}
	if failureCount != 1 {
		t.Fatalf("expected exactly 1 rejected reservation (INSUFFICIENT_STOCK), got %d", failureCount)
	}

	// Verify reserved stock is 1
	if orderRepo.reserved != 1 {
		t.Fatalf("expected reserved stock to be 1, got %d", orderRepo.reserved)
	}

	// Verify releasing expired reservation restores available stock
	released, err := orderRepo.ReleaseExpiredReservations(context.Background())
	if err != nil || released != 1 {
		t.Fatalf("expected 1 released reservation, got %d (err: %v)", released, err)
	}
	if orderRepo.reserved != 0 {
		t.Fatalf("expected reserved stock to be 0 after release, got %d", orderRepo.reserved)
	}
}

// TC-08: Card Decline Simulation ending with 0000 preserves reservation lock
func TestTC08_CardDecline_PreservesReservationLock(t *testing.T) {
	orderRepo := &mockConcurrentOrderRepo{
		stock:        1,
		reserved:     1,
		reservations: make(map[string]*models.StockReservation),
	}
	orderNumber := "AURA-20261104-5555"
	orderRepo.reservations[orderNumber] = &models.StockReservation{
		OrderID:   uuid.New(),
		Quantity:  1,
		Status:    "ACTIVE",
		ExpiresAt: time.Now().Add(15 * time.Minute),
	}

	checkoutSvc := service.NewCheckoutService(orderRepo, nil)

	req := dto.PaymentProcessRequest{
		OrderNumber:   orderNumber,
		PaymentMethod: "CREDIT_CARD",
		CardNumber:    "4532 1111 2222 0000", // Decline simulator
	}

	_, err := checkoutSvc.ProcessPayment(context.Background(), req)
	if err != service.ErrCardDeclined {
		t.Fatalf("expected ErrCardDeclined, got %v", err)
	}

	// Crucial check: Reservation lock must still be ACTIVE
	res := orderRepo.reservations[orderNumber]
	if res.Status != "ACTIVE" {
		t.Fatalf("expected reservation status to remain ACTIVE after decline, got %s", res.Status)
	}
	if orderRepo.reserved != 1 {
		t.Fatalf("expected reserved count to remain 1, got %d", orderRepo.reserved)
	}
}
