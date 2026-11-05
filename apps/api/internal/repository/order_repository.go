package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
	ErrInvalidSerialNumbers   = errors.New("invalid serial numbers")
	ErrShipmentRequired       = errors.New("a carrier and tracking number are required to ship")
)

type OrderRepository interface {
	CreateReservationAtomic(ctx context.Context, order *models.Order, items []models.OrderItem, reservations []models.StockReservation) error
	CommitReservationAndPay(ctx context.Context, orderNumber string, paymentMethod string, installmentJSON datatypes.JSON) (*models.Order, error)
	ReleaseExpiredReservations(ctx context.Context) (int64, error)
	GetOrderByNumber(ctx context.Context, orderNumber string) (*models.Order, error)
	GetOrderByID(ctx context.Context, id uuid.UUID) (*models.Order, error)
	ListOrders(ctx context.Context, filter dto.OrderListFilter) ([]models.Order, int64, error)
	ListOrdersForUser(ctx context.Context, userID uuid.UUID) ([]models.Order, error)
	UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, newStatus string, serialNumbers map[string][]string, shipment models.Shipment) error
	CancelPendingOrder(ctx context.Context, orderNumber string) (*models.Order, error)
	ListEmailsForOrder(ctx context.Context, orderID uuid.UUID) ([]models.EmailMessage, error)
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
			if err := requireOnSale(tx, variant.ProductID); err != nil {
				return fmt.Errorf("%w: %s", err, variant.SKU)
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
			orderID := order.ID
			if err := recordMovement(tx, variant.ID, newStock-variant.StockQuantity, newStock, models.StockReasonSale, order.OrderNumber, nil, &orderID); err != nil {
				return err
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

		return queueEmail(tx, &order, models.EmailOrderConfirmed, "")
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
				if err := notifyBackInStock(tx, variant.ID); err != nil {
					return err
				}
			}

			_ = tx.Model(&res).Update("status", "RELEASED").Error

			// Cancel the order. Only the first of its reservations matches, so the email and the
			// return of its items to the bag happen once per order.
			cancel := tx.Model(&models.Order{}).Where("id = ? AND status = ?", res.OrderID, models.OrderStatusPendingPayment).
				Update("status", models.OrderStatusCancelled)
			if cancel.Error == nil && cancel.RowsAffected == 1 {
				var order models.Order
				if err := tx.Preload("Items").First(&order, "id = ?", res.OrderID).Error; err == nil {
					if err := restoreToCart(tx, &order); err != nil {
						return err
					}
					if err := queueEmail(tx, &order, models.EmailOrderCancelled, models.CancelReasonExpired); err != nil {
						return err
					}
				}
			}

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

func (r *orderRepository) ListOrders(ctx context.Context, filter dto.OrderListFilter) ([]models.Order, int64, error) {
	// Page and Limit are validated by the handler, which also reports them in the response meta.
	offset := (filter.Page - 1) * filter.Limit

	query := r.db.WithContext(ctx).Model(&models.Order{})
	if filter.Status != "" && filter.Status != "ALL" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Search != "" {
		pattern := "%" + escapeLikePattern(filter.Search) + "%"
		query = query.Where("order_number ILIKE ? OR customer_email ILIKE ?", pattern, pattern)
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
		Limit(filter.Limit).
		Find(&orders).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list orders: %w", err)
	}

	for i := range orders {
		orders[i].AllowedTransitions = models.AdminOrderTransitions(orders[i].Status)
	}

	return orders, total, nil
}

func (r *orderRepository) UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, newStatus string, serialNumbers map[string][]string, shipment models.Shipment) error {
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

		changed, err := mergeSerialNumbers(order.Items, serialNumbers, models.SerialsEditable(order.Status))
		if err != nil {
			return err
		}
		for _, i := range changed {
			if err := tx.Model(&order.Items[i]).Update("serial_numbers", order.Items[i].SerialNumbers).Error; err != nil {
				return fmt.Errorf("failed to save serial numbers for item %s: %w", order.Items[i].ID, err)
			}
		}

		if newStatus == models.OrderStatusShipped && !allUnitsHaveSerials(order.Items) {
			return ErrSerialNumberRequired
		}

		previous := order.Status
		updates := map[string]interface{}{"status": newStatus}
		now := time.Now()
		if previous != newStatus {
			switch newStatus {
			case models.OrderStatusShipped:
				carrier, tracking, err := normalizeShipment(shipment)
				if err != nil {
					return err
				}
				updates["carrier"], updates["tracking_number"], updates["shipped_at"] = carrier, tracking, now
			case models.OrderStatusDelivered:
				updates["delivered_at"] = now
			}
		}
		if err := tx.Model(&order).Updates(updates).Error; err != nil {
			return fmt.Errorf("failed to update order status: %w", err)
		}

		if previous == newStatus {
			return nil // serial numbers recorded; nothing the customer needs to hear about
		}
		switch newStatus {
		case models.OrderStatusShipped:
			return queueEmail(tx, &order, models.EmailOrderShipped, "")
		case models.OrderStatusDelivered:
			return queueEmail(tx, &order, models.EmailOrderDelivered, "")
		case models.OrderStatusCancelled:
			return queueEmail(tx, &order, models.EmailOrderCancelled, models.CancelReasonStore)
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

	variantIDs := make([]uuid.UUID, 0, len(reservations))
	for _, res := range reservations {
		var variant models.ProductVariant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&variant, "id = ?", res.VariantID).Error; err != nil {
			return fmt.Errorf("variant %s not found: %w", res.VariantID, err)
		}

		updates := map[string]interface{}{}
		if res.Status == "ACTIVE" {
			updates["reserved_stock"] = max(variant.ReservedStock-res.Quantity, 0)
		} else {
			restocked := variant.StockQuantity + res.Quantity
			updates["stock_quantity"] = restocked
			oid := orderID
			if err := recordMovement(tx, variant.ID, res.Quantity, restocked, models.StockReasonCancelRestock, "", nil, &oid); err != nil {
				return err
			}
		}
		if err := tx.Model(&variant).Updates(updates).Error; err != nil {
			return fmt.Errorf("failed to restore stock for variant %s: %w", variant.ID, err)
		}
		if err := tx.Model(&res).Update("status", "RELEASED").Error; err != nil {
			return fmt.Errorf("failed to release reservation %s: %w", res.ID, err)
		}
		variantIDs = append(variantIDs, variant.ID)
	}
	return notifyBackInStock(tx, variantIDs...)
}

// storeZone is the business's local time (Thailand has no DST), used to bucket orders by day.
var storeZone = time.FixedZone("ICT", 7*60*60)

// unpaidStatuses never count toward revenue.
var unpaidStatuses = []string{models.OrderStatusPendingPayment, models.OrderStatusCancelled}

func (r *orderRepository) GetAdminOverview(ctx context.Context) (*dto.AdminOverviewStats, error) {
	return r.adminOverviewAt(ctx, time.Now())
}

func (r *orderRepository) adminOverviewAt(ctx context.Context, now time.Time) (*dto.AdminOverviewStats, error) {
	db := r.db.WithContext(ctx)
	stats := &dto.AdminOverviewStats{
		OrdersByStatus:  make(map[string]int64),
		DailyRevenue:    []dto.DailyRevenue{},
		CategoryRevenue: []dto.CategoryRevenue{},
		LowStockAlerts:  []dto.LowStockItem{},
	}

	// 1. Orders by status, total orders.
	var statusCounts []struct {
		Status string
		Count  int64
	}
	if err := db.Model(&models.Order{}).Select("status, count(*) AS count").Group("status").Scan(&statusCounts).Error; err != nil {
		return nil, fmt.Errorf("failed to count orders by status: %w", err)
	}
	for _, sc := range statusCounts {
		stats.OrdersByStatus[sc.Status] = sc.Count
		stats.TotalOrdersCount += sc.Count
	}

	// 2. Paid revenue: all time, last 30 days, and the 30 days before (for the trend).
	today := time.Date(now.In(storeZone).Year(), now.In(storeZone).Month(), now.In(storeZone).Day(), 0, 0, 0, 0, storeZone)
	since30 := today.AddDate(0, 0, -29)
	since60 := since30.AddDate(0, 0, -30)
	var rev struct {
		Total, Paid, Last30, Prev30 int64
	}
	if err := db.Model(&models.Order{}).
		Where("status NOT IN ?", unpaidStatuses).
		Select(`COALESCE(SUM(grand_total), 0) AS total,
			COUNT(*) AS paid,
			COALESCE(SUM(grand_total) FILTER (WHERE created_at >= ?), 0) AS last30,
			COALESCE(SUM(grand_total) FILTER (WHERE created_at >= ? AND created_at < ?), 0) AS prev30`,
			since30, since60, since30).
		Scan(&rev).Error; err != nil {
		return nil, fmt.Errorf("failed to sum revenue: %w", err)
	}
	stats.TotalRevenueSatang, stats.PaidOrdersCount = rev.Total, rev.Paid
	stats.Revenue30dSatang, stats.RevenuePrev30dSatang = rev.Last30, rev.Prev30

	// 3. Daily paid revenue for the last 7 store-local days, zero-filled.
	since7 := today.AddDate(0, 0, -6)
	var days []struct {
		Day     string
		Revenue int64
		Orders  int64
	}
	if err := db.Model(&models.Order{}).
		Where("status NOT IN ? AND created_at >= ?", unpaidStatuses, since7).
		Select("to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day, SUM(grand_total) AS revenue, COUNT(*) AS orders").
		Group("day").
		Scan(&days).Error; err != nil {
		return nil, fmt.Errorf("failed to bucket daily revenue: %w", err)
	}
	stats.DailyRevenue = fillDailyRevenue(since7, 7, days)

	// 4. Paid line-item revenue by product category.
	if err := db.Table("order_items AS oi").
		Joins("JOIN orders o ON o.id = oi.order_id").
		Joins("LEFT JOIN product_variants v ON v.id = oi.variant_id").
		Joins("LEFT JOIN products p ON p.id = v.product_id").
		Joins("LEFT JOIN categories c ON c.id = p.category_id").
		Where("o.status NOT IN ?", unpaidStatuses).
		Select("COALESCE(c.name, 'Uncategorized') AS category, SUM(oi.unit_price * oi.quantity) AS revenue_satang, SUM(oi.quantity) AS units").
		Group("category").
		Order("revenue_satang DESC").
		Scan(&stats.CategoryRevenue).Error; err != nil {
		return nil, fmt.Errorf("failed to sum category revenue: %w", err)
	}

	// 5. Low stock alerts (where stock_quantity - reserved_stock <= 3)
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

	err := db.Table("product_variants").
		Select("product_variants.id as variant_id, product_variants.product_id, products.name as product_name, product_variants.sku, product_variants.color_name, product_variants.stock_quantity, product_variants.reserved_stock, (product_variants.stock_quantity - product_variants.reserved_stock) as available_stock").
		Joins("JOIN products ON products.id = product_variants.product_id").
		Where("(product_variants.stock_quantity - product_variants.reserved_stock) <= 3").
		Order("available_stock ASC").
		Scan(&lowStockVariants).Error

	if err != nil {
		return nil, fmt.Errorf("failed to load low stock alerts: %w", err)
	}
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

	return stats, nil
}

// likeEscaper makes user input match literally inside a LIKE/ILIKE pattern (Postgres escape char is \).
var likeEscaper = strings.NewReplacer(`\`, `\`, `%`, `\%`, `_`, `\_`)

func escapeLikePattern(s string) string {
	return likeEscaper.Replace(s)
}

// mergeSerialNumbers applies per-unit serials from input (order item ID -> serials) onto items
// and returns the indexes of items that changed. A blank entry keeps the saved serial for that
// unit, so a partially filled form never erases data. Serials must be unique within the order.
// When editable is false, input is accepted only if it would change nothing.
func mergeSerialNumbers(items []models.OrderItem, input map[string][]string, editable bool) ([]int, error) {
	byID := make(map[string]int, len(items))
	for i := range items {
		byID[items[i].ID.String()] = i
	}

	var changed []int
	for id, serials := range input {
		i, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("%w: item %s is not part of this order", ErrInvalidSerialNumbers, id)
		}
		item := &items[i]
		if len(serials) > item.Quantity {
			return nil, fmt.Errorf("%w: %d serials given for %s but quantity is %d", ErrInvalidSerialNumbers, len(serials), item.SKUSnapshot, item.Quantity)
		}

		merged := make([]string, item.Quantity)
		copy(merged, item.SerialNumbers)
		differs := false
		for u, sn := range serials {
			sn = strings.ToUpper(strings.TrimSpace(sn))
			if sn != "" && sn != merged[u] {
				merged[u] = sn
				differs = true
			}
		}
		if !differs {
			continue
		}
		if !editable {
			return nil, fmt.Errorf("%w: serial numbers can only be changed before the order ships", ErrInvalidSerialNumbers)
		}
		item.SerialNumbers = merged
		changed = append(changed, i)
	}

	seen := map[string]string{}
	for _, item := range items {
		for _, sn := range item.SerialNumbers {
			if sn == "" {
				continue
			}
			if other, dup := seen[sn]; dup {
				return nil, fmt.Errorf("%w: serial %s is used for both %s and %s", ErrInvalidSerialNumbers, sn, other, item.SKUSnapshot)
			}
			seen[sn] = item.SKUSnapshot
		}
	}
	return changed, nil
}

// allUnitsHaveSerials reports whether every unit of every item has a non-empty serial.
func allUnitsHaveSerials(items []models.OrderItem) bool {
	for _, item := range items {
		if len(item.SerialNumbers) < item.Quantity {
			return false
		}
		for _, sn := range item.SerialNumbers[:item.Quantity] {
			if sn == "" {
				return false
			}
		}
	}
	return true
}

// fillDailyRevenue returns n consecutive days starting at from, using the matching row's
// totals where one exists and zero otherwise.
func fillDailyRevenue(from time.Time, n int, rows []struct {
	Day     string
	Revenue int64
	Orders  int64
}) []dto.DailyRevenue {
	byDay := make(map[string]int, len(rows))
	for i, row := range rows {
		byDay[row.Day] = i
	}
	out := make([]dto.DailyRevenue, n)
	for i := range out {
		day := from.AddDate(0, 0, i).Format("2006-01-02")
		out[i] = dto.DailyRevenue{Date: day}
		if j, ok := byDay[day]; ok {
			out[i].RevenueSatang, out[i].Orders = rows[j].Revenue, rows[j].Orders
		}
	}
	return out
}

// maxAccountOrders caps the account order history; enough for any realistic customer.
const maxAccountOrders = 200

// ListOrdersForUser returns orders placed while signed in to this account, newest first.
func (r *orderRepository) ListOrdersForUser(ctx context.Context, userID uuid.UUID) ([]models.Order, error) {
	var orders []models.Order
	err := r.db.WithContext(ctx).
		Preload("Items").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(maxAccountOrders).
		Find(&orders).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list account orders: %w", err)
	}

	// Product slugs let the account page link each line to its product (e.g. to review it).
	var variantIDs []uuid.UUID
	for _, o := range orders {
		for _, it := range o.Items {
			variantIDs = append(variantIDs, it.VariantID)
		}
	}
	if len(variantIDs) > 0 {
		var rows []struct {
			ID   uuid.UUID
			Slug string
		}
		if err := r.db.WithContext(ctx).Table("product_variants v").Select("v.id, p.slug").
			Joins("JOIN products p ON p.id = v.product_id").Where("v.id IN ?", variantIDs).Scan(&rows).Error; err != nil {
			return nil, fmt.Errorf("failed to load product links: %w", err)
		}
		slugs := make(map[uuid.UUID]string, len(rows))
		for _, row := range rows {
			slugs[row.ID] = row.Slug
		}
		for i := range orders {
			for j := range orders[i].Items {
				orders[i].Items[j].ProductSlug = slugs[orders[i].Items[j].VariantID]
			}
		}
	}
	return orders, nil
}
