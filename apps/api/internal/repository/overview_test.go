package repository

import (
	"testing"
	"time"
)

func TestFillDailyRevenueZeroFillsMissingDays(t *testing.T) {
	from := time.Date(2026, 10, 30, 0, 0, 0, 0, storeZone)
	rows := []struct {
		Day     string
		Revenue int64
		Orders  int64
	}{
		{"2026-11-01", 3990000, 1}, // crosses the month boundary
		{"2026-11-05", 7980000, 2},
		{"2026-10-20", 999, 9}, // outside the window, ignored
	}
	got := fillDailyRevenue(from, 7, rows)

	want := []struct {
		date    string
		revenue int64
		orders  int64
	}{
		{"2026-10-30", 0, 0}, {"2026-10-31", 0, 0}, {"2026-11-01", 3990000, 1}, {"2026-11-02", 0, 0},
		{"2026-11-03", 0, 0}, {"2026-11-04", 0, 0}, {"2026-11-05", 7980000, 2},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d days, want %d", len(got), len(want))
	}
	for i, w := range want {
		if got[i].Date != w.date || got[i].RevenueSatang != w.revenue || got[i].Orders != w.orders {
			t.Errorf("day %d = %+v, want %+v", i, got[i], w)
		}
	}
}
