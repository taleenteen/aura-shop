package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode int
	bytesCount int
}

func (w *responseWriterInterceptor) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseWriterInterceptor) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	w.bytesCount += n
	return n, err
}

func RequestLoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		interceptor := &responseWriterInterceptor{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(interceptor, r)

		duration := time.Since(start)
		reqID := middleware.GetReqID(r.Context())
		user := GetUserFromContext(r.Context())
		guestID := GetGuestIDFromContext(r.Context())

		userEmail := "anonymous"
		if user != nil {
			userEmail = user.Email
		}

		guestStr := "none"
		if guestID != nil {
			guestStr = *guestID
		}

		slog.Info("http request",
			"status", interceptor.statusCode,
			"method", r.Method,
			"path", r.URL.Path,
			"query", r.URL.RawQuery,
			"duration_ms", duration.Milliseconds(),
			"req_id", reqID,
			"user", userEmail,
			"guest_id", guestStr,
		)
	})
}
