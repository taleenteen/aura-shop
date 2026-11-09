package middleware

import (
	"net/http"
	"strings"
)

// SecurityHeaders sets the response headers recommended for a JSON API (OWASP Secure Headers):
// no MIME sniffing, no framing, no referrer leaks, and no caching of signed-in responses.
// HSTS is only sent in production, where the API is served over HTTPS.
func SecurityHeaders(production bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
			// The API only returns JSON and files, never pages, so nothing may run or be framed.
			// The Swagger UI is a page and needs its own scripts and styles.
			if !strings.HasPrefix(r.URL.Path, "/swagger") {
				h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
			}
			if production {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			// Responses for a signed-in user or a guest bag are personal: keep them out of
			// shared and browser caches.
			if r.Header.Get("Authorization") != "" || r.Header.Get(GuestSessionHeader) != "" {
				h.Set("Cache-Control", "no-store")
			}
			next.ServeHTTP(w, r)
		})
	}
}
