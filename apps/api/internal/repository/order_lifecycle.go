package repository

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrOrderNotCancellable is returned when a customer tries to cancel an order that is already paid,
// shipped or cancelled. Paid orders are cancelled by the store, which handles the refund.
var ErrOrderNotCancellable = errors.New("only orders awaiting payment can be cancelled")

// queueEmail records a customer email in the same transaction as the order change it reports.
func queueEmail(tx *gorm.DB, order *models.Order, kind, reason string) error {
	msg := models.NewOrderEmail(order, kind, reason, time.Now())
	if err := tx.Create(&msg).Error; err != nil {
		return fmt.Errorf("failed to queue %s email: %w", kind, err)
	}
	slog.Info("email sent", "kind", kind, "order", order.OrderNumber, "to", order.CustomerEmail)
	return nil
}

// restoreToCart puts an unpaid order's items back in its owner's bag, so a cancelled or expired
// checkout can be retried without re-adding everything. Products taken off sale are skipped.
func restoreToCart(tx *gorm.DB, order *models.Order) error {
	if order.UserID == nil && order.GuestSessionID == nil {
		return nil
	}
	for _, item := range order.Items {
		var variant models.ProductVariant
		if err := tx.First(&variant, "id = ?", item.VariantID).Error; err != nil {
			continue
		}
		if requireOnSale(tx, variant.ProductID) != nil {
			continue
		}

		q := tx.Where("variant_id = ?", item.VariantID)
		if order.UserID != nil {
			q = q.Where("user_id = ?", *order.UserID)
		} else {
			q = q.Where("guest_session_id = ? AND user_id IS NULL", *order.GuestSessionID)
		}
		var existing models.CartItem
		err := q.First(&existing).Error
		switch {
		case err == nil:
			if err := tx.Model(&existing).Update("quantity", existing.Quantity+item.Quantity).Error; err != nil {
				return fmt.Errorf("failed to restore cart item: %w", err)
			}
		case errors.Is(err, gorm.ErrRecordNotFound):
			row := models.CartItem{
				UserID:         order.UserID,
				GuestSessionID: guestOnly(order.UserID, order.GuestSessionID),
				VariantID:      item.VariantID,
				Quantity:       item.Quantity,
			}
			if err := tx.Create(&row).Error; err != nil {
				return fmt.Errorf("failed to restore cart item: %w", err)
			}
		default:
			return err
		}
	}
	return nil
}

// CancelPendingOrder lets the customer abandon an unpaid order: the held stock is released,
// the items go back to their bag and a cancellation email is sent.
func (r *orderRepository) CancelPendingOrder(ctx context.Context, orderNumber string) (*models.Order, error) {
	var order models.Order
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Items").First(&order, "order_number = ?", orderNumber).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOrderNotFound
			}
			return err
		}
		if order.Status != models.OrderStatusPendingPayment {
			return ErrOrderNotCancellable
		}
		if err := releaseOrderStock(tx, order.ID); err != nil {
			return err
		}
		if err := tx.Model(&order).Update("status", models.OrderStatusCancelled).Error; err != nil {
			return fmt.Errorf("failed to cancel order: %w", err)
		}
		if err := restoreToCart(tx, &order); err != nil {
			return err
		}
		reason := models.CancelReasonCustomer
		if time.Now().After(order.ReservationExpiresAt) {
			reason = models.CancelReasonExpired // the checkout timer ran out before the worker got to it
		}
		return queueEmail(tx, &order, models.EmailOrderCancelled, reason)
	})
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// ListEmailsForOrder returns the emails sent about an order, newest first.
func (r *orderRepository) ListEmailsForOrder(ctx context.Context, orderID uuid.UUID) ([]models.EmailMessage, error) {
	var msgs []models.EmailMessage
	err := r.db.WithContext(ctx).Where("order_id = ?", orderID).Order("sent_at DESC").Find(&msgs).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list emails: %w", err)
	}
	return msgs, nil
}
