package models

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// Customer emails. Order emails are written in the same transaction as the order change
// they describe (a transactional outbox), so an order can never change state without its email.
// Account emails (password reset) belong to a user instead of an order.
const (
	EmailOrderConfirmed = "ORDER_CONFIRMED" // payment received
	EmailOrderShipped   = "ORDER_SHIPPED"
	EmailOrderDelivered = "ORDER_DELIVERED"
	EmailOrderCancelled = "ORDER_CANCELLED"
	EmailPasswordReset  = "PASSWORD_RESET" // account email: link to choose a new password
)

// Why an order was cancelled; carried in an ORDER_CANCELLED email's data.
const (
	CancelReasonCustomer = "customer" // the customer cancelled before paying
	CancelReasonExpired  = "expired"  // the 15-minute payment window ran out
	CancelReasonStore    = "store"    // cancelled by the store
)

const (
	EmailSender        = "AURA Tech <orders@auratech.co.th>"
	AccountEmailSender = "AURA Tech <account@auratech.co.th>"
)

type EmailMessage struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OrderID   *uuid.UUID     `gorm:"type:uuid;index" json:"order_id"` // set for order emails
	UserID    *uuid.UUID     `gorm:"type:uuid;index" json:"user_id"`  // set for account emails
	Kind      string         `gorm:"type:varchar(32);not null" json:"kind"`
	Sender    string         `gorm:"not null" json:"sender"`
	Recipient string         `gorm:"not null" json:"recipient"`
	Subject   string         `gorm:"not null" json:"subject"`
	Preheader string         `gorm:"not null;default:''" json:"preheader"`
	Data      datatypes.JSON `gorm:"type:jsonb" json:"data"`
	SentAt    time.Time      `gorm:"index;not null" json:"sent_at"`
}

// NewOrderEmail builds the email for an order event. reason is the cancellation reason for
// ORDER_CANCELLED and empty otherwise; it is stored in Data for the email template.
func NewOrderEmail(order *Order, kind, reason string, now time.Time) EmailMessage {
	subject, preheader := orderEmailCopy(order.OrderNumber, kind, reason)
	var data datatypes.JSON
	if reason != "" {
		data, _ = json.Marshal(map[string]string{"reason": reason})
	}
	return EmailMessage{
		OrderID:   &order.ID,
		Kind:      kind,
		Sender:    EmailSender,
		Recipient: order.CustomerEmail,
		Subject:   subject,
		Preheader: preheader,
		Data:      data,
		SentAt:    now,
	}
}

func orderEmailCopy(n, kind, reason string) (string, string) {
	switch kind {
	case EmailOrderConfirmed:
		return fmt.Sprintf("Order confirmed: %s", n), "Thanks for your order. We're preparing it now."
	case EmailOrderShipped:
		return fmt.Sprintf("Your order %s is on the way", n), "Your parcel is with the courier. Warranty serial numbers are inside."
	case EmailOrderDelivered:
		return fmt.Sprintf("Delivered: %s", n), "Your order has arrived. Enjoy your new gear."
	case EmailOrderCancelled:
		switch reason {
		case CancelReasonExpired:
			return fmt.Sprintf("Payment window closed: %s", n), "We didn't receive payment in time, so the items are back in your bag."
		case CancelReasonCustomer:
			return fmt.Sprintf("Order cancelled: %s", n), "You cancelled this order. The items are back in your bag."
		}
		return fmt.Sprintf("Order cancelled: %s", n), "Your order has been cancelled. Any payment will be refunded in full."
	}
	return fmt.Sprintf("Update on order %s", n), ""
}

// PasswordResetTTL is how long a password reset link stays valid.
const PasswordResetTTL = 30 * time.Minute

// NewPasswordResetEmail builds the email carrying a password reset link. The raw token appears
// only here, as it would in a real inbox; the database keeps its hash.
func NewPasswordResetEmail(user *User, token string, now time.Time) EmailMessage {
	data, _ := json.Marshal(map[string]any{"token": token, "expires_minutes": int(PasswordResetTTL / time.Minute)})
	return EmailMessage{
		UserID:    &user.ID,
		Kind:      EmailPasswordReset,
		Sender:    AccountEmailSender,
		Recipient: user.Email,
		Subject:   "Reset your AURA Tech password",
		Preheader: "Use this link within 30 minutes to choose a new password.",
		Data:      data,
		SentAt:    now,
	}
}

// PasswordResetToken is a single-use reset link. Only the SHA-256 of the token is stored.
type PasswordResetToken struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null"`
	TokenHash string    `gorm:"type:char(64);uniqueIndex;not null"`
	ExpiresAt time.Time `gorm:"not null"`
	UsedAt    *time.Time
	CreatedAt time.Time
}
