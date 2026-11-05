package repository

import (
	"testing"
	"time"
)

func TestPeriodStart(t *testing.T) {
	ict := time.FixedZone("ICT", 7*3600)
	thu := time.Date(2026, 11, 5, 15, 0, 0, 0, ict) // a Thursday
	cases := map[string]string{"day": "2026-11-05", "week": "2026-11-02", "month": "2026-11-01"}
	for group, want := range cases {
		if got := periodStart(thu, group).Format("2006-01-02"); got != want {
			t.Errorf("%s: got %s, want %s", group, got, want)
		}
	}
	sun := time.Date(2026, 11, 8, 0, 0, 0, 0, ict)
	if got := periodStart(sun, "week").Format("2006-01-02"); got != "2026-11-02" {
		t.Errorf("Sunday belongs to the week starting Monday 2 Nov, got %s", got)
	}
	if got := nextPeriod(time.Date(2026, 1, 31, 0, 0, 0, 0, ict), "day").Format("2006-01-02"); got != "2026-02-01" {
		t.Errorf("next day: %s", got)
	}
}
