package models

import (
	"strings"
	"testing"
	"time"
)

func TestNewOrderEmailCancellationCopyFollowsReason(t *testing.T) {
	order := &Order{OrderNumber: "AURA-20261105-ABCDEFGH", CustomerEmail: "a@b.co"}
	now := time.Now()

	expired := NewOrderEmail(order, EmailOrderCancelled, CancelReasonExpired, now)
	if !strings.Contains(expired.Subject, "Payment window closed") || string(expired.Data) != `{"reason":"expired"}` {
		t.Fatalf("expired email: %q %s", expired.Subject, expired.Data)
	}
	store := NewOrderEmail(order, EmailOrderCancelled, CancelReasonStore, now)
	if !strings.Contains(store.Preheader, "refunded") {
		t.Fatalf("store cancellation should mention the refund: %q", store.Preheader)
	}
	confirmed := NewOrderEmail(order, EmailOrderConfirmed, "", now)
	if confirmed.Data != nil || confirmed.Recipient != "a@b.co" || confirmed.Sender != EmailSender {
		t.Fatalf("confirmed email: %+v", confirmed)
	}
}
