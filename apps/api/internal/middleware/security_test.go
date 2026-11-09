package middleware_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/response"

	"github.com/google/uuid"
)

// --- JWT sessions -------------------------------------------------------------------------

type sessionRow struct {
	role    string
	version int
}

type fakeSessions map[uuid.UUID]sessionRow

func (f fakeSessions) SessionState(_ context.Context, id uuid.UUID) (string, int, bool, error) {
	row, ok := f[id]
	return row.role, row.version, ok, nil
}

type failingSessions struct{}

func (failingSessions) SessionState(context.Context, uuid.UUID) (string, int, bool, error) {
	return "", 0, false, errors.New("database down")
}

// signedInAs runs a request with a token for user through the JWT middleware and returns the
// user the handler saw (nil when the token was refused).
func signedInAs(t *testing.T, user *models.User, sessions middleware.SessionStore) *middleware.AuthUser {
	t.Helper()
	const secret = "test_secret_key_12345"
	token, err := middleware.GenerateJWT(user, secret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	var seen *middleware.AuthUser
	middleware.JWTOptionalMiddleware(secret, sessions)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = middleware.GetUserFromContext(r.Context())
	})).ServeHTTP(httptest.NewRecorder(), req)
	return seen
}

func TestJWTRefusesTokensFromBeforeAPasswordChange(t *testing.T) {
	user := &models.User{ID: uuid.New(), Email: "a@b.co", Role: "CUSTOMER", TokenVersion: 2}
	if got := signedInAs(t, user, fakeSessions{user.ID: {role: "CUSTOMER", version: 3}}); got != nil {
		t.Fatalf("token signed at version 2 accepted after the version moved to 3")
	}
	if got := signedInAs(t, user, fakeSessions{user.ID: {role: "CUSTOMER", version: 2}}); got == nil {
		t.Fatalf("current token refused")
	}
}

func TestJWTTakesTheRoleFromTheDatabase(t *testing.T) {
	user := &models.User{ID: uuid.New(), Email: "a@b.co", Role: "ADMIN"}
	got := signedInAs(t, user, fakeSessions{user.ID: {role: "CUSTOMER"}})
	if got == nil || got.Role != "CUSTOMER" {
		t.Fatalf("expected the demoted role CUSTOMER, got %+v", got)
	}
}

func TestJWTFailsClosed(t *testing.T) {
	user := &models.User{ID: uuid.New(), Email: "a@b.co", Role: "ADMIN"}
	if got := signedInAs(t, user, fakeSessions{}); got != nil {
		t.Fatalf("token for a deleted user accepted")
	}
	if got := signedInAs(t, user, failingSessions{}); got != nil {
		t.Fatalf("token accepted while the session store was failing")
	}
}

// --- Rate limiting ------------------------------------------------------------------------

func TestRateLimiterSlidingWindow(t *testing.T) {
	l := middleware.NewRateLimiter(3, time.Minute)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	middleware.SetRateLimiterClock(l, func() time.Time { return now })

	for i := 0; i < 3; i++ {
		if ok, _, _ := l.Allow("ip"); !ok {
			t.Fatalf("request %d refused under the limit", i+1)
		}
	}
	ok, _, retry := l.Allow("ip")
	if ok || retry <= 0 {
		t.Fatalf("4th request: ok=%v retry=%v, want refused with a wait", ok, retry)
	}
	if ok, _, _ := l.Allow("other-ip"); !ok {
		t.Fatalf("a different key shares the count")
	}

	// Just after the window turns, the previous window still weighs almost fully.
	now = now.Add(61 * time.Second)
	if ok, _, _ := l.Allow("ip"); ok {
		t.Fatalf("burst allowed right at the window boundary")
	}
	// Two windows later the count has gone.
	now = now.Add(2 * time.Minute)
	if ok, _, _ := l.Allow("ip"); !ok {
		t.Fatalf("still refused after the window passed")
	}
}

func TestRateLimitMiddlewareAnswers429(t *testing.T) {
	h := middleware.RateLimit("test", 2, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	var last *httptest.ResponseRecorder
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "203.0.113.7:51000"
		last = httptest.NewRecorder()
		h.ServeHTTP(last, req)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("3rd request status %d, want 429", last.Code)
	}
	if last.Header().Get("Retry-After") == "" {
		t.Fatalf("429 without Retry-After")
	}
	var env response.Envelope
	_ = json.Unmarshal(last.Body.Bytes(), &env)
	if env.Error == nil || env.Error.Code != "RATE_LIMITED" {
		t.Fatalf("unexpected body %s", last.Body.String())
	}
}

// --- Security headers and body limit ------------------------------------------------------

func TestSecurityHeaders(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer x")
	middleware.SecurityHeaders(true)(ok).ServeHTTP(rec, req)
	for name, want := range map[string]string{
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'",
		"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
		"Cache-Control":             "no-store",
	} {
		if got := rec.Header().Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}

	rec = httptest.NewRecorder()
	middleware.SecurityHeaders(false)(ok).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/swagger/index.html", nil))
	if rec.Header().Get("Strict-Transport-Security") != "" || rec.Header().Get("Content-Security-Policy") != "" {
		t.Errorf("development Swagger page got HSTS or the API CSP")
	}
}

func TestBodyLimit(t *testing.T) {
	read := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.ReadAll(r.Body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
		}
	})
	h := middleware.BodyLimit(10, "/upload/")(read)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(strings.Repeat("a", 11))))
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("declared oversize body: status %d, want 413", rec.Code)
	}

	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(strings.Repeat("a", 11)))
	req.ContentLength = -1 // chunked: size unknown up front
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("chunked oversize body: status %d, want the read to fail", rec.Code)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/upload/img", strings.NewReader(strings.Repeat("a", 11))))
	if rec.Code != http.StatusOK {
		t.Fatalf("exempt route limited: status %d", rec.Code)
	}
}

// --- Idempotency --------------------------------------------------------------------------

type memoryIdempotency struct {
	mu   sync.Mutex
	rows map[string]*models.IdempotencyKey
}

func (m *memoryIdempotency) Claim(_ context.Context, owner, key, fp string) (*models.IdempotencyKey, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if rec, ok := m.rows[owner+key]; ok {
		cp := *rec
		return &cp, false, nil
	}
	rec := &models.IdempotencyKey{Owner: owner, Key: key, Fingerprint: fp}
	m.rows[owner+key] = rec
	return rec, true, nil
}

func (m *memoryIdempotency) Complete(_ context.Context, owner, key string, status int, body []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	rec := m.rows[owner+key]
	rec.StatusCode, rec.Body, rec.CompletedAt = status, append([]byte(nil), body...), &now
	return nil
}

func (m *memoryIdempotency) Release(_ context.Context, owner, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rows, owner+key)
	return nil
}

func TestIdempotencyReplaysTheFirstResponse(t *testing.T) {
	store := &memoryIdempotency{rows: map[string]*models.IdempotencyKey{}}
	calls := 0
	h := middleware.Idempotency(store)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		response.Success(w, http.StatusCreated, map[string]int{"order": calls}, nil)
	}))
	send := func(key, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/checkout/reserve", strings.NewReader(body))
		req.Header.Set(middleware.IdempotencyHeader, key)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	first := send("attempt-0001", `{"a":1}`)
	again := send("attempt-0001", `{"a":1}`)
	if calls != 1 {
		t.Fatalf("handler ran %d times for one key", calls)
	}
	if again.Code != http.StatusCreated || again.Body.String() != first.Body.String() || again.Header().Get("Idempotent-Replayed") != "true" {
		t.Fatalf("replay = %d %s, want the first response", again.Code, again.Body.String())
	}
	if rec := send("attempt-0001", `{"a":2}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("same key, different body: status %d, want 422", rec.Code)
	}
	if send("attempt-0002", `{"a":1}`); calls != 2 {
		t.Fatalf("a new key did not run the handler")
	}
}

func TestIdempotencyLetsServerErrorsBeRetried(t *testing.T) {
	store := &memoryIdempotency{rows: map[string]*models.IdempotencyKey{}}
	fail := true
	h := middleware.Idempotency(store)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if fail {
			response.InternalServerError(w, "boom")
			return
		}
		response.Success(w, http.StatusOK, "paid", nil)
	}))
	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/checkout/pay", strings.NewReader(`{}`))
		req.Header.Set(middleware.IdempotencyHeader, "attempt-0001")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := send(); code != http.StatusInternalServerError {
		t.Fatalf("first attempt %d", code)
	}
	fail = false
	if code := send(); code != http.StatusOK {
		t.Fatalf("retry after a 5xx: status %d, want the handler to run again", code)
	}
}

func TestIdempotencyRefusesARequestStillRunning(t *testing.T) {
	store := &memoryIdempotency{rows: map[string]*models.IdempotencyKey{}}
	started, release := make(chan struct{}), make(chan struct{})
	h := middleware.Idempotency(store)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		response.Success(w, http.StatusOK, "paid", nil)
	}))
	send := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/checkout/pay", strings.NewReader("{}"))
		req.Header.Set(middleware.IdempotencyHeader, "attempt-0001")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	done := make(chan *httptest.ResponseRecorder)
	go func() { done <- send() }()
	<-started
	if rec := send(); rec.Code != http.StatusConflict {
		t.Fatalf("second request while the first runs: status %d, want 409", rec.Code)
	}
	close(release)
	if rec := <-done; rec.Code != http.StatusOK {
		t.Fatalf("first request: status %d", rec.Code)
	}
}
