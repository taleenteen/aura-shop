package models

import (
	"testing"

	"github.com/google/uuid"
)

func TestCanAdminTransitionOrder(t *testing.T) {
	cases := []struct {
		from, to string
		want     bool
	}{
		// Payment only happens through checkout, never by admin edit.
		{OrderStatusPendingPayment, OrderStatusPaidProcessing, false},
		{OrderStatusPendingPayment, OrderStatusCancelled, true},
		{OrderStatusPaidProcessing, OrderStatusPaidProcessing, true},
		{OrderStatusPaidProcessing, OrderStatusSNAssigned, true},
		{OrderStatusPaidProcessing, OrderStatusShipped, true},
		{OrderStatusPaidProcessing, OrderStatusCancelled, true},
		{OrderStatusPaidProcessing, OrderStatusPendingPayment, false},
		{OrderStatusSNAssigned, OrderStatusShipped, true},
		{OrderStatusShipped, OrderStatusDelivered, true},
		{OrderStatusShipped, OrderStatusPendingPayment, false},
		{OrderStatusShipped, OrderStatusCancelled, false},
		{OrderStatusDelivered, OrderStatusShipped, false},
		{OrderStatusCancelled, OrderStatusShipped, false},
		{OrderStatusCancelled, OrderStatusCancelled, false},
		{"UNKNOWN", OrderStatusCancelled, false},
	}
	for _, c := range cases {
		if got := CanAdminTransitionOrder(c.from, c.to); got != c.want {
			t.Errorf("CanAdminTransitionOrder(%s, %s) = %v, want %v", c.from, c.to, got, c.want)
		}
	}
}

func TestOrderIsVisibleTo(t *testing.T) {
	owner, stranger := uuid.New(), uuid.New()
	guest, otherGuest := "guest_a", "guest_b"
	userOrder := &Order{UserID: &owner, GuestSessionID: &guest}
	guestOrder := &Order{GuestSessionID: &guest}

	cases := []struct {
		name  string
		order *Order
		user  *uuid.UUID
		guest *string
		want  bool
	}{
		{"owner signed in", userOrder, &owner, &otherGuest, true},
		{"same browser, signed out", userOrder, nil, &guest, true},
		{"other user, other browser", userOrder, &stranger, &otherGuest, false},
		{"guest order, same browser", guestOrder, nil, &guest, true},
		{"guest order, other browser", guestOrder, nil, &otherGuest, false},
		{"guest order, any signed-in user elsewhere", guestOrder, &stranger, &otherGuest, false},
		{"no identity at all", guestOrder, nil, nil, false},
	}
	for _, c := range cases {
		if got := c.order.IsVisibleTo(c.user, c.guest); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
