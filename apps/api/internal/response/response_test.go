package response_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"aura-tech/api/internal/response"
)

func TestSuccessResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	meta := &response.Meta{Page: 1, Limit: 10, TotalItems: 1}
	data := map[string]string{"name": "MacBook Pro"}

	response.Success(rec, http.StatusOK, data, meta)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var env response.Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if !env.Success {
		t.Fatalf("expected success to be true")
	}
	if env.Error != nil {
		t.Fatalf("expected error to be nil")
	}
	if env.Meta == nil || env.Meta.TotalItems != 1 {
		t.Fatalf("expected meta total_items to be 1")
	}
}

func TestErrorResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	response.Error(rec, http.StatusBadRequest, "INVALID_INPUT", "Invalid payload provided")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	var env response.Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("failed to unmarshal error envelope: %v", err)
	}

	if env.Success {
		t.Fatalf("expected success to be false")
	}
	if env.Error == nil || env.Error.Code != "INVALID_INPUT" {
		t.Fatalf("expected error code INVALID_INPUT, got %+v", env.Error)
	}
}

func TestPaginationMetaKeepsZeroCounts(t *testing.T) {
	rec := httptest.NewRecorder()
	response.Success(rec, http.StatusOK, []string{}, &response.Meta{Page: 1, Limit: 20})

	var body struct {
		Meta map[string]any `json:"meta"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"total_items", "total_pages"} {
		if v, ok := body.Meta[key]; !ok || v != float64(0) {
			t.Errorf("meta.%s = %v (present %v), want 0", key, v, ok)
		}
	}
}
