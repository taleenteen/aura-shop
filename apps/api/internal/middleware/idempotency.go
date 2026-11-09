package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"aura-tech/api/internal/models"
	"aura-tech/api/internal/response"
)

// IdempotencyHeader names a retry-safe operation (as in the IETF draft and the Stripe API).
// The client makes one key per attempt and sends the same key again when it retries.
const IdempotencyHeader = "Idempotency-Key"

// IdempotencyStore keeps the first response for each (owner, key).
type IdempotencyStore interface {
	Claim(ctx context.Context, owner, key, fingerprint string) (*models.IdempotencyKey, bool, error)
	Complete(ctx context.Context, owner, key string, status int, body []byte) error
	Release(ctx context.Context, owner, key string) error
}

// Idempotency makes POST routes safe to retry. A request with an Idempotency-Key runs once;
// a repeat with the same key and body gets the stored response (marked Idempotent-Replayed),
// a repeat while the first is still running gets 409, and the same key with a different body
// gets 422. Server errors (5xx) are not stored, so the client can retry them with the same
// key. Requests without the header run as usual.
func Idempotency(store IdempotencyStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := strings.TrimSpace(r.Header.Get(IdempotencyHeader))
			if key == "" || r.Method == http.MethodGet || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			if len(key) < 8 || len(key) > 255 {
				response.BadRequest(w, "Idempotency-Key must be 8 to 255 characters")
				return
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				response.BadRequest(w, "invalid request body")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))

			sum := sha256.New()
			sum.Write([]byte(r.Method + " " + r.URL.Path + "\n"))
			sum.Write(body)
			fingerprint := hex.EncodeToString(sum.Sum(nil))
			owner := idempotencyOwner(r)

			rec, claimed, err := store.Claim(r.Context(), owner, key, fingerprint)
			if err != nil {
				slog.Error("idempotency claim failed", "error", err)
				response.InternalServerError(w, "Something went wrong. Please try again.")
				return
			}
			if !claimed {
				switch {
				case rec.Fingerprint != fingerprint:
					response.Error(w, http.StatusUnprocessableEntity, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.")
				case rec.CompletedAt == nil:
					response.Error(w, http.StatusConflict, "REQUEST_IN_PROGRESS", "This request is still being processed. Please wait a moment.")
				default:
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("Idempotent-Replayed", "true")
					w.WriteHeader(rec.StatusCode)
					_, _ = w.Write(rec.Body)
				}
				return
			}

			// Work on the stored record continues even if the client disconnects.
			ctx := context.WithoutCancel(r.Context())
			rw := &recordingWriter{ResponseWriter: w, status: http.StatusOK}
			defer func() {
				if p := recover(); p != nil {
					// Free the key so it is not stuck "in progress", then let Recoverer answer.
					_ = store.Release(ctx, owner, key)
					panic(p)
				}
			}()
			next.ServeHTTP(rw, r)

			if rw.status >= 500 {
				if err := store.Release(ctx, owner, key); err != nil {
					slog.Error("idempotency release failed", "error", err)
				}
				return
			}
			if err := store.Complete(ctx, owner, key, rw.status, rw.buf.Bytes()); err != nil {
				slog.Error("idempotency save failed", "error", err)
			}
		})
	}
}

// idempotencyOwner scopes keys to the caller, so one client cannot replay another's response.
func idempotencyOwner(r *http.Request) string {
	if u := GetUserFromContext(r.Context()); u != nil {
		return "user:" + u.ID.String()
	}
	if g := GetGuestIDFromContext(r.Context()); g != nil && *g != "" {
		return "guest:" + *g
	}
	return "ip:" + ClientIP(r)
}

// recordingWriter passes the response through and keeps a copy of the status and body.
type recordingWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	buf         bytes.Buffer
}

func (w *recordingWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status, w.wroteHeader = code, true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *recordingWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	w.buf.Write(b)
	return w.ResponseWriter.Write(b)
}
