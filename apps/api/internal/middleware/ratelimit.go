package middleware

import (
	"math"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"aura-tech/api/internal/response"
)

// RateLimiter counts requests per key (usually the client IP) with a sliding window: the
// previous window's count is weighted by how much of it still overlaps the last `window`, so
// a client cannot double its quota by bursting at a window boundary.
//
// Counts live in memory, so each API instance limits on its own. That is enough for one
// instance; several instances behind a load balancer would share counts through Redis instead.
type RateLimiter struct {
	limit  int
	window time.Duration
	now    func() time.Time

	mu        sync.Mutex
	counters  map[string]*windowCount
	lastSweep time.Time
}

type windowCount struct {
	start    time.Time // start of the current window
	current  int
	previous int
}

// NewRateLimiter allows `limit` requests per key in any `window`.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limit: limit, window: window, now: time.Now, counters: map[string]*windowCount{}}
}

// Allow records one request for key. It returns whether the request may go ahead, how many
// requests are left, and, when refused, how long until one more would be allowed.
func (l *RateLimiter) Allow(key string) (ok bool, remaining int, retryAfter time.Duration) {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastSweep) > l.window {
		l.sweep(now)
	}

	c := l.counters[key]
	if c == nil {
		c = &windowCount{start: now.Truncate(l.window)}
		l.counters[key] = c
	}
	switch elapsed := now.Sub(c.start); {
	case elapsed >= 2*l.window:
		c.start, c.previous, c.current = now.Truncate(l.window), 0, 0
	case elapsed >= l.window:
		c.start, c.previous, c.current = c.start.Add(l.window), c.current, 0
	}

	overlap := 1 - float64(now.Sub(c.start))/float64(l.window)
	used := float64(c.previous)*overlap + float64(c.current)
	if used+1 > float64(l.limit) {
		// Wait until the end of the current window, when the previous window's weight is gone.
		wait := c.start.Add(l.window).Sub(now)
		if c.current+1 > l.limit {
			wait += l.window // the current window alone is already full
		}
		return false, 0, wait
	}
	c.current++
	return true, int(math.Max(0, float64(l.limit)-used-1)), 0
}

// sweep drops keys that have been idle for two windows.
func (l *RateLimiter) sweep(now time.Time) {
	for k, c := range l.counters {
		if now.Sub(c.start) >= 2*l.window {
			delete(l.counters, k)
		}
	}
	l.lastSweep = now
}

// ClientIP is the request's remote IP without the port. With TRUST_PROXY on, chi's RealIP
// middleware has already replaced RemoteAddr with the forwarded client address.
func ClientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// RateLimit refuses requests over the limit with 429 RATE_LIMITED and a Retry-After header.
// `scope` keeps separate counts for routes that share a limiter key (e.g. "login").
func RateLimit(scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
	limiter := NewRateLimiter(limit, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			ok, remaining, retryAfter := limiter.Allow(scope + "|" + ClientIP(r))
			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
			if !ok {
				seconds := int(math.Ceil(retryAfter.Seconds()))
				if seconds < 1 {
					seconds = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(seconds))
				response.Error(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many attempts. Please wait "+humanWait(seconds)+" and try again.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func humanWait(seconds int) string {
	if seconds < 60 {
		if seconds == 1 {
			return "a second"
		}
		return strconv.Itoa(seconds) + " seconds"
	}
	minutes := (seconds + 59) / 60
	if minutes == 1 {
		return "a minute"
	}
	return strconv.Itoa(minutes) + " minutes"
}
