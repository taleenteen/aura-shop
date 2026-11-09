package middleware

import (
	"net/http"
	"strings"

	"aura-tech/api/internal/response"
)

// BodyLimit caps request bodies at maxBytes so one request cannot exhaust memory. Routes that
// take files set their own, larger limit and are listed in exemptPrefixes.
func BodyLimit(maxBytes int64, exemptPrefixes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, p := range exemptPrefixes {
				if strings.HasPrefix(r.URL.Path, p) {
					next.ServeHTTP(w, r)
					return
				}
			}
			// A declared size over the limit is refused before reading anything.
			if r.ContentLength > maxBytes {
				response.Error(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "The request is too large.")
				return
			}
			// Chunked or understated bodies are cut off while reading; the handler then fails
			// to decode them and answers 400.
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}
