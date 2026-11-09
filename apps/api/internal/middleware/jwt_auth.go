package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"aura-tech/api/internal/models"
	"aura-tech/api/internal/response"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type JWTClaims struct {
	UserID uuid.UUID `json:"user_id"`
	Email  string    `json:"email"`
	Role   string    `json:"role"`
	// Version is the user's token_version when the token was signed. Raising it (password
	// change or reset, "sign out everywhere") makes every older token invalid.
	Version int `json:"ver"`
	jwt.RegisteredClaims
}

func GenerateJWT(user *models.User, secret string, ttl time.Duration) (string, error) {
	claims := JWTClaims{
		UserID:  user.ID,
		Email:   user.Email,
		Role:    user.Role,
		Version: user.TokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
			Issuer:    "aura-tech-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("failed to sign jwt token: %w", err)
	}

	return tokenString, nil
}

// SessionStore reads what the server currently knows about a token's user.
type SessionStore interface {
	// SessionState returns the user's role and token version; found is false for deleted users.
	SessionState(ctx context.Context, userID uuid.UUID) (role string, tokenVersion int, found bool, err error)
}

// JWTOptionalMiddleware signs the request in when it carries a valid bearer token. Besides the
// signature and expiry it checks the token against the database: a token signed before the
// user's last password change or "sign out everywhere" is refused, and the role comes from
// the database, so a removed admin loses access at once instead of when the token expires.
// Requests without a usable token continue as guests; RequireAuth/RequireAdmin refuse them.
func JWTOptionalMiddleware(secret string, sessions SessionStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authHeader == "" || !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
				next.ServeHTTP(w, r)
				return
			}

			tokenString := strings.TrimSpace(authHeader[7:])
			if tokenString == "" {
				next.ServeHTTP(w, r)
				return
			}

			token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return []byte(secret), nil
			})

			if err == nil && token.Valid {
				if claims, ok := token.Claims.(*JWTClaims); ok {
					role, version, found, err := sessions.SessionState(r.Context(), claims.UserID)
					if err != nil || !found || version != claims.Version {
						// Fail closed: a database error must not let a revoked token through.
						next.ServeHTTP(w, r)
						return
					}
					authUser := &AuthUser{
						ID:    claims.UserID,
						Email: claims.Email,
						Role:  role,
					}
					ctx := context.WithValue(r.Context(), ContextKeyUser, authUser)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUserFromContext(r.Context())
		if user == nil {
			response.Unauthorized(w, "Authentication required to access this resource")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUserFromContext(r.Context())
		if user == nil {
			response.Unauthorized(w, "Authentication required to access this resource")
			return
		}
		if user.Role != "ADMIN" {
			response.Forbidden(w, "Admin privileges required to access this resource")
			return
		}
		next.ServeHTTP(w, r)
	})
}
