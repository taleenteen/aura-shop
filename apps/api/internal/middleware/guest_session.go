package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	GuestSessionHeader = "X-Guest-Session-ID"
	GuestSessionCookie = "aura_guest_session_id"
)

func GuestSessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		guestID := strings.TrimSpace(r.Header.Get(GuestSessionHeader))

		if guestID == "" {
			if cookie, err := r.Cookie(GuestSessionCookie); err == nil {
				guestID = strings.TrimSpace(cookie.Value)
			}
		}

		if guestID == "" {
			guestID = "guest_" + uuid.NewString()
			http.SetCookie(w, &http.Cookie{
				Name:     GuestSessionCookie,
				Value:    guestID,
				Path:     "/",
				HttpOnly: false,
				Secure:   false,
				SameSite: http.SameSiteLaxMode,
				Expires:  time.Now().Add(30 * 24 * time.Hour),
			})
		}

		w.Header().Set(GuestSessionHeader, guestID)

		ctx := context.WithValue(r.Context(), ContextKeyGuestID, guestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
