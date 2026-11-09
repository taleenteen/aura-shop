package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"

	"github.com/google/uuid"
)

func TestGuestSessionMiddleware_GeneratesNew(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/catalog", nil)
	rec := httptest.NewRecorder()

	var capturedGuestID *string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedGuestID = middleware.GetGuestIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.GuestSessionMiddleware(next)
	handler.ServeHTTP(rec, req)

	if capturedGuestID == nil || !strings.HasPrefix(*capturedGuestID, "guest_") {
		t.Fatalf("expected generated guest id starting with guest_, got %v", capturedGuestID)
	}

	headerVal := rec.Header().Get(middleware.GuestSessionHeader)
	if headerVal != *capturedGuestID {
		t.Fatalf("expected header %s to match captured %s", headerVal, *capturedGuestID)
	}
}

func TestGuestSessionMiddleware_PreservesExistingHeader(t *testing.T) {
	existingID := "guest_existing-uuid-12345"
	req := httptest.NewRequest(http.MethodGet, "/cart", nil)
	req.Header.Set(middleware.GuestSessionHeader, existingID)
	rec := httptest.NewRecorder()

	var capturedGuestID *string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedGuestID = middleware.GetGuestIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.GuestSessionMiddleware(next)
	handler.ServeHTTP(rec, req)

	if capturedGuestID == nil || *capturedGuestID != existingID {
		t.Fatalf("expected preserved guest id %s, got %v", existingID, capturedGuestID)
	}
}

func TestJWTAuthMiddleware(t *testing.T) {
	secret := "test_secret_key_12345"
	user := &models.User{
		ID:    uuid.New(),
		Email: "admin@auratech.co.th",
		Role:  "ADMIN",
	}

	token, err := middleware.GenerateJWT(user, secret, 1*time.Hour)
	if err != nil {
		t.Fatalf("failed to generate jwt: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/overview", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	var capturedUser *middleware.AuthUser
	protected := middleware.RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = middleware.GetUserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	chain := middleware.JWTOptionalMiddleware(secret, fakeSessions{user.ID: {role: "ADMIN"}})(protected)
	chain.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if capturedUser == nil || capturedUser.Email != user.Email || capturedUser.Role != "ADMIN" {
		t.Fatalf("expected captured admin user, got %+v", capturedUser)
	}
}
