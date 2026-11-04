package models

import "testing"

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
