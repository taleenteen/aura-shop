package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrReservationExpired     = errors.New("reservation lock has expired")
	ErrOrderNotFound          = errors.New("order not found")
	ErrSerialNumberRequired   = errors.New("serial number is required for all items before shipping")
	ErrInvalidOrderTransition = errors.New("invalid order status transition")
)

type OrderRepository interface {
	CreateReservationAtomic(ctx context.Context, order *models.Order, items []models.OrderItem, reservations []models.StockReservation) error
	CommitReservationAndPay(ctx context.Context, orderNumber string, paymentMethod string, installmentJSON datatypes.JSON) (*models.Order, error)
	ReleaseExpiredReservations(ctx context.Context) (int64, error)
	GetOrderByNumber(ctx context.Context, orderNumber string) (*models.Order, error)
	GetOrderByID(ctx context.Context, id uuid.UUID) (*models.Order, error)
	ListOrders(ctx context.Context, status string, page, limit int) ([]models.Order, int64, error)
	UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, newStatus string, serialNumbers map[string]string) error
	GetAdminOverview(ctx context.Context) (*dto.AdminOverviewStats, error)
}

type orderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) OrderRepository {
	return &orderRepository{db: db}
}

func (r *orderRepository) CreateReservationAtomic(ctx context.Context, order *models.Order, items []models.OrderItem, reservations []models.StockReservation) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1. Lock each variant row and check available stock
		for i := range reservations {
			var variant models.ProductVariant
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&variant, "id = ?", reservations[i].VariantID).Error; err != nil {
				return fmt.Errorf("variant %s not found: %w", reservations[i].VariantID, err)
			}

			available := variant.StockQuantity - variant.ReservedStock
			if available < reservations[i].Quantity {
				return fmt.Errorf("insufficient stock for SKU %s: available %d, requested %d", variant.SKU, available, reservations[i].Quantity)
			}

			// Increment reserved_stock
			if err := tx.Model(&variant).Update("reserved_stock", variant.ReservedStock+reservations[i].Quantity).Error; err != nil {
				return fmt.Errorf("failed to reserve stock for variant %s: %w", variant.ID, err)
			}
		}

		// 2. Insert Order
		if err := tx.Create(order).Error; err != nil {
			return fmt.Errorf("failed to create order: %w", err)
		}

		// 3. Link and insert OrderItems
		for i := range items {
			items[i].OrderID = order.ID
			if err := tx.Create(&items[i]).Error; err != nil {
				return fmt.Errorf("failed to create order item: %w", err)
			}
		}

		// 4. Link and insert StockReservations
		for i := range reservations {
			reservations[i].OrderID = order.ID
			if err := tx.Create(&reservations[i]).Error; err != nil {
				return fmt.Errorf("failed to create stock reservation: %w", err)
			}
		}

		// 5. Clear User or Guest cart
		cartQ := tx.Where("1 = 1")
		if order.UserID != nil {
			cartQ = cartQ.Where("user_id = ?", *order.UserID)
		} else if order.GuestSessionID != nil {
			cartQ = cartQ.Where("guest_session_id = ?", *order.GuestSessionID)
		}
		_ = cartQ.Delete(&models.CartItem{}).Error

		return nil
	})
}

func (r *orderRepository) CommitReservationAndPay(ctx context.Context, orderNumber string, paymentMethod string, installmentJSON datatypes.JSON) (*models.Order, error) {
	var order models.Order
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the order row so an admin cancel cannot interleave with payment.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Items").First(&order, "order_number = ?", orderNumber).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOrderNotFound
			}
			return err
		}

		if order.Status != "PENDING_PAYMENT" {
			return fmt.Errorf("order cannot be paid: current status is %s", order.Status)
		}

		if time.Now().After(order.ReservationExpiresAt) {
			return ErrReservationExpired
		}

		// Commit all active reservations for this order
		var reservations []models.StockReservation
		if err := tx.Where("order_id = ? AND status = ?", order.ID, "ACTIVE").Find(&reservations).Error; err != nil {
			return err
		}

		for _, res := range reservations {
			var variant models.ProductVariant
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&variant, "id = ?", res.VariantID).Error; err != nil {
				return err
			}

			newStock := variant.StockQuantity - res.Quantity
			if newStock < 0 {
				newStock = 0
			}
			newReserved := variant.ReservedStock - res.Quantity
			if newReserved < 0 {
				newReserved = 0
			}

			if err := tx.Model(&variant).Updates(map[string]interface{}{
				"stock_quantity": newStock,
				"reserved_stock": newReserved,
			}).Error; err != nil {
				return err
			}

			// Mark reservation COMMITTED
			if err := tx.Model(&res).Update("status", "COMMITTED").Error; err != nil {
				return err
			}
		}

		// Update order status to PAID_PROCESSING
		updates := map[string]interface{}{
			"status":         "PAID_PROCESSING",
			"payment_method": paymentMethod,
			"updated_at":     time.Now(),
		}
		if len(installmentJSON) > 0 {
			updates["installment_plan"] = installmentJSON
		}

		if err := tx.Model(&order).Updates(updates).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	_ = r.db.WithContext(ctx).Preload("Items").First(&order, "id = ?", order.ID).Error
	return &order, nil
}

func (r *orderRepository) ReleaseExpiredReservations(ctx context.Context) (int64, error) {
	var releasedCount int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var expiredReservations []models.StockReservation
		now := time.Now()
		err := tx.Where("status = ? AND expires_at < ?", "ACTIVE", now).Find(&expiredReservations).Error
		if err != nil {
			return err
		}

		for _, res := range expiredReservations {
			var variant models.ProductVariant
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&variant, "id = ?", res.VariantID).Error; err == nil {
				newReserved := variant.ReservedStock - res.Quantity
				if newReserved < 0 {
					newReserved = 0
				}
				_ = tx.Model(&variant).Update("reserved_stock", newReserved).Error
			}

			_ = tx.Model(&res).Update("status", "RELEASED").Error

			// Mark order as CANCELLED
			_ = tx.Model(&models.Order{}).Where("id = ? AND status = ?", res.OrderID, "PENDING_PAYMENT").
				Update("status", "CANCELLED").Error

			releasedCount++
		}

		return nil
	})

	return releasedCount, err
}

func (r *orderRepository) GetOrderByNumber(ctx context.Context, orderNumber string) (*models.Order, error) {
	var order models.Order
	err := r.db.WithContext(ctx).Preload("Items").First(&order, "order_number = ?", orderNumber).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to fetch order: %w", err)
	}
	return &order, nil
}

func (r *orderRepository) GetOrderByID(ctx context.Context, id uuid.UUID) (*models.Order, error) {
	var order models.Order
	err := r.db.WithContext(ctx).Preload("Items").First(&order, "id = ?", id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to fetch order: %w", err)
	}
	return &order, nil
}

func (r *orderRepository) ListOrders(ctx context.Context, status string, page, limit int) ([]models.Order, int64, error) {
	// page and limit are validated by the handler, which also reports them in the response meta.
	offset := (page - 1) * limit

	query := r.db.WithContext(ctx).Model(&models.Order{})
	if status != "" && status != "ALL" {
		query = query.Where("status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count orders: %w", err)
	}

	var orders []models.Order
	err := query.
		Preload("Items").
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&orders).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list orders: %w", err)
	}

	for i := range orders {
		orders[i].AllowedTransitions = models.AdminOrderTransitions(orders[i].Status)
	}

	return orders, total, nil
}

func (r *orderRepository) UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, newStatus string, serialNumbers map[string]string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var order models.Order
		// Lock the order row so a concurrent checkout payment or cancel sees the final status.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Items").First(&order, "id = ?", orderID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOrderNotFound
			}
			return err
		}

		if !models.CanAdminTransitionOrder(order.Status, newStatus) {
			return fmt.Errorf("%w: %s -> %s", ErrInvalidOrderTransition, order.Status, newStatus)
		}

		if newStatus == models.OrderStatusCancelled {
			if err := releaseOrderStock(tx, order.ID); err != nil {
				return err
			}
		}

		// Apply Serial Numbers if provided
		if len(serialNumbers) > 0 {
			for key, sn := range serialNumbers {
				for i := range order.Items {
					// Match either by direct UUID string or if single item in order
					if order.Items[i].ID.String() == key || (len(order.Items) == 1 && (key == "primary" || key == "default" || key == order.Items[i].VariantID.String())) {
						order.Items[i].SerialNumber = sn
						if err := tx.Model(&order.Items[i]).Update("serial_number", sn).Error; err != nil {
							return fmt.Errorf("failed to save serial number for item %s: %w", order.Items[i].ID, err)
						}
					}
				}
			}
		}

		// State Machine Validation:
		// When transitioning to SHIPPED, all items MUST have a serial number assigned
		if newStatus == "SHIPPED" {
			for _, item := range order.Items {
				hasSN := item.SerialNumber != ""
				if sn, ok := serialNumbers[item.ID.String()]; ok && sn != "" {
					hasSN = true
				} else if len(order.Items) == 1 {
					for _, snVal := range serialNumbers {
						if snVal != "" {
							hasSN = true
						}
					}
				}
				if !hasSN {
					return ErrSerialNumberRequired
				}
			}
		}

		if err := tx.Model(&order).Update("status", newStatus).Error; err != nil {
			return fmt.Errorf("failed to update order status: %w", err)
		}

		return nil
	})
}

// releaseOrderStock returns a cancelled order's stock: ACTIVE reservations give back their
// reserved units, COMMITTED ones (already deducted at payment) are added back to physical stock.
func releaseOrderStock(tx *gorm.DB, orderID uuid.UUID) error {
	var reservations []models.StockReservation
	if err := tx.Where("order_id = ? AND status IN ?", orderID, []string{"ACTIVE", "COMMITTED"}).Find(&reservations).Error; err != nil {
		return fmt.Errorf("failed to load reservations: %w", err)
	}

	for _, res := range reservations {
		var variant models.ProductVariant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&variant, "id = ?", res.VariantID).Error; err != nil {
			return fmt.Errorf("variant %s not found: %w", res.VariantID, err)
		}

		updates := map[string]interface{}{}
		if res.Status == "ACTIVE" {
			updates["reserved_stock"] = max(variant.ReservedStock-res.Quantity, 0)
		} else {
			updates["stock_quantity"] = variant.StockQuantity + res.Quantity
		}
		if err := tx.Model(&variant).Updates(updates).Error; err != nil {
			return fmt.Errorf("failed to restore stock for variant %s: %w", variant.ID, err)
		}
		if err := tx.Model(&res).Update("status", "RELEASED").Error; err != nil {
			return fmt.Errorf("failed to release reservation %s: %w", res.ID, err)
		}
	}
	return nil
}

func (r *orderRepository) GetAdminOverview(ctx context.Context) (*dto.AdminOverviewStats, error) {
	stats := &dto.AdminOverviewStats{
		OrdersByStatus: make(map[string]int64),
		LowStockAlerts: []dto.LowStockItem{},
	}

	// 1. Total Revenue in Satang for completed/paid orders
	var revResult struct {
		TotalRevenue int64
	}
	_ = r.db.WithContext(ctx).Model(&models.Order{}).
		Where("status NOT IN (?)", []string{"PENDING_PAYMENT", "CANCELLED"}).
		Select("COALESCE(SUM(grand_total), 0) as total_revenue").
		Scan(&revResult).Error
	stats.TotalRevenueSatang = revResult.TotalRevenue

	// 2. Orders count by status
	var statusCounts []struct {
		Status string
		Count  int64
	}
	_ = r.db.WithContext(ctx).Model(&models.Order{}).
		Select("status, count(*) as count").
		Group("status").
		Scan(&statusCounts).Error

	var totalOrders int64
	for _, sc := range statusCounts {
		stats.OrdersByStatus[sc.Status] = sc.Count
		totalOrders += sc.Count
	}
	stats.TotalOrdersCount = totalOrders

	// 3. Low stock alerts (where stock_quantity - reserved_stock <= 3)
	var lowStockVariants []struct {
		VariantID      uuid.UUID
		ProductID      uuid.UUID
		ProductName    string
		SKU            string
		ColorName      string
		StockQuantity  int
		ReservedStock  int
		AvailableStock int
	}

	err := r.db.WithContext(ctx).Table("product_variants").
		Select("product_variants.id as variant_id, product_variants.product_id, products.name as product_name, product_variants.sku, product_variants.color_name, product_variants.stock_quantity, product_variants.reserved_stock, (product_variants.stock_quantity - product_variants.reserved_stock) as available_stock").
		Joins("JOIN products ON products.id = product_variants.product_id").
		Where("(product_variants.stock_quantity - product_variants.reserved_stock) <= 3").
		Order("available_stock ASC").
		Scan(&lowStockVariants).Error

	if err == nil {
		for _, v := range lowStockVariants {
			stats.LowStockAlerts = append(stats.LowStockAlerts, dto.LowStockItem{
				VariantID:      v.VariantID,
				ProductID:      v.ProductID,
				ProductName:    v.ProductName,
				SKU:            v.SKU,
				ColorName:      v.ColorName,
				StockQuantity:  v.StockQuantity,
				ReservedStock:  v.ReservedStock,
				AvailableStock: v.AvailableStock,
			})
		}
	}

	return stats, nil
}
