package response

import (
	"encoding/json"
	"net/http"
)

type Meta struct {
	// Pagination counts are always sent: zero results is a real answer, not a missing field.
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	TotalItems int `json:"total_items"`
	TotalPages int `json:"total_pages"`
	Facets     any `json:"facets,omitempty"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Envelope struct {
	Success bool      `json:"success"`
	Data    any       `json:"data"`
	Meta    *Meta     `json:"meta"`
	Error   *APIError `json:"error"`
}

func JSON(w http.ResponseWriter, statusCode int, payload Envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func Success(w http.ResponseWriter, statusCode int, data any, meta *Meta) {
	JSON(w, statusCode, Envelope{
		Success: true,
		Data:    data,
		Meta:    meta,
		Error:   nil,
	})
}

func Error(w http.ResponseWriter, statusCode int, code string, message string) {
	JSON(w, statusCode, Envelope{
		Success: false,
		Data:    nil,
		Meta:    nil,
		Error: &APIError{
			Code:    code,
			Message: message,
		},
	})
}

func BadRequest(w http.ResponseWriter, message string) {
	Error(w, http.StatusBadRequest, "BAD_REQUEST", message)
}

func Unauthorized(w http.ResponseWriter, message string) {
	Error(w, http.StatusUnauthorized, "UNAUTHORIZED", message)
}

func Forbidden(w http.ResponseWriter, message string) {
	Error(w, http.StatusForbidden, "FORBIDDEN", message)
}

func NotFound(w http.ResponseWriter, message string) {
	Error(w, http.StatusNotFound, "NOT_FOUND", message)
}

func Conflict(w http.ResponseWriter, code string, message string) {
	Error(w, http.StatusConflict, code, message)
}

func InternalServerError(w http.ResponseWriter, message string) {
	Error(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", message)
}
