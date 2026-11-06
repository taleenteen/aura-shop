package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"aura-tech/api/internal/handler"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/response"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// A path id that is not a UUID is a bad request (400), not a missing record (404).
// The id is rejected before any service is used, so the handlers get none.
func TestMalformedPathIDIsBadRequest(t *testing.T) {
	merch := handler.NewMerchandisingHandler(nil, nil)
	engagement := handler.NewEngagementHandler(nil, nil)
	auth := handler.NewAuthHandler(nil)

	r := chi.NewRouter()
	r.Put("/admin/banners/{id}", merch.UpdateBanner)
	r.Patch("/admin/banners/{id}/status", merch.SetBannerStatus)
	r.Delete("/admin/banners/{id}", merch.DeleteBanner)
	r.Put("/admin/categories/{id}", merch.UpdateCategory)
	r.Delete("/admin/categories/{id}", merch.DeleteCategory)
	r.Put("/admin/brands/{id}", merch.UpdateBrand)
	r.Delete("/admin/brands/{id}", merch.DeleteBrand)
	r.Patch("/admin/reviews/{id}", engagement.SetReviewHidden)
	r.Put("/account/stock-alerts/{variantID}", engagement.SubscribeStockAlert)
	r.Delete("/account/stock-alerts/{variantID}", engagement.UnsubscribeStockAlert)
	r.Get("/auth/emails/{id}", auth.GetAccountEmail)

	cases := []struct{ method, path string }{
		{http.MethodPut, "/admin/banners/not-a-uuid"},
		{http.MethodPatch, "/admin/banners/not-a-uuid/status"},
		{http.MethodDelete, "/admin/banners/not-a-uuid"},
		{http.MethodPut, "/admin/categories/123"},
		{http.MethodDelete, "/admin/categories/123"},
		{http.MethodPut, "/admin/brands/abc"},
		{http.MethodDelete, "/admin/brands/abc"},
		{http.MethodPatch, "/admin/reviews/abc"},
		{http.MethodPut, "/account/stock-alerts/abc"},
		{http.MethodDelete, "/account/stock-alerts/abc"},
		{http.MethodGet, "/auth/emails/abc"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(c.method, c.path, bytes.NewBufferString(`{}`))
			// Signed in as an admin, so only the id can be wrong.
			admin := &middleware.AuthUser{ID: uuid.New(), Email: "admin@example.com", Role: "ADMIN"}
			req = req.WithContext(context.WithValue(req.Context(), middleware.ContextKeyUser, admin))
			r.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", rec.Code, rec.Body.String())
			}
			var env response.Envelope
			if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil || env.Error == nil || env.Error.Code != "BAD_REQUEST" {
				t.Fatalf("want a BAD_REQUEST envelope, got %s", rec.Body.String())
			}
		})
	}
}
