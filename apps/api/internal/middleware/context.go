package middleware

import (
	"context"

	"github.com/google/uuid"
)

type contextKey string

const (
	ContextKeyUser    contextKey = "aura_user"
	ContextKeyGuestID contextKey = "aura_guest_id"
)

type AuthUser struct {
	ID    uuid.UUID
	Email string
	Role  string
}

func GetUserFromContext(ctx context.Context) *AuthUser {
	if val := ctx.Value(ContextKeyUser); val != nil {
		if user, ok := val.(*AuthUser); ok {
			return user
		}
	}
	return nil
}

func GetGuestIDFromContext(ctx context.Context) *string {
	if val := ctx.Value(ContextKeyGuestID); val != nil {
		if guestID, ok := val.(string); ok && guestID != "" {
			return &guestID
		}
	}
	return nil
}
