package middleware

import "time"

// SetRateLimiterClock lets tests move time forward.
func SetRateLimiterClock(l *RateLimiter, now func() time.Time) { l.now = now }
