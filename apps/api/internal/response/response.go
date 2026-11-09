package response

import (
	"encoding/json"
	"log/slog"
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
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"` // per-field problems, keyed by input path
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

// ValidationFailed reports invalid input with a message per offending field.
func ValidationFailed(w http.ResponseWriter, message string, fields map[string]string) {
	JSON(w, http.StatusBadRequest, Envelope{
		Success: false,
		Error:   &APIError{Code: "VALIDATION_FAILED", Message: message, Fields: fields},
	})
}

// ServerError logs err and answers 500 with a generic message, so database and driver errors
// (table names, SQL, hosts) never reach the client.
func ServerError(w http.ResponseWriter, err error) {
	slog.Error("request failed", "error", err)
	InternalServerError(w, "Something went wrong on our side. Please try again.")
}
