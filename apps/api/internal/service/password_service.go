package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// ErrResetLinkInvalid covers unknown, used and expired reset links alike.
	ErrResetLinkInvalid = errors.New("this reset link is invalid or has expired")
	// ErrWeakPassword is returned when a new password is too short.
	ErrWeakPassword = errors.New("password must be at least 6 characters")
	// ErrWrongPassword is returned when the current password does not match.
	ErrWrongPassword = errors.New("current password is incorrect")
)

const minPasswordLength = 6

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// RequestPasswordReset issues a reset link for a customer account and emails it. It returns
// the email's ID so the storefront can open it, or nil when no link was sent: unknown emails,
// and admin accounts, which are not reset through the storefront.
func (s *authService) RequestPasswordReset(ctx context.Context, email string) (*uuid.UUID, error) {
	user, err := s.userRepo.GetByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return nil, err
	}
	if user == nil || user.Role == "ADMIN" {
		return nil, nil
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("failed to generate reset token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := time.Now()
	msg := models.NewPasswordResetEmail(user, token, now)

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// A new link replaces any earlier unused one.
		if err := tx.Model(&models.PasswordResetToken{}).
			Where("user_id = ? AND used_at IS NULL", user.ID).
			Update("used_at", now).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.PasswordResetToken{
			UserID:    user.ID,
			TokenHash: hashResetToken(token),
			ExpiresAt: now.Add(models.PasswordResetTTL),
		}).Error; err != nil {
			return err
		}
		return tx.Create(&msg).Error
	})
	if err != nil {
		return nil, fmt.Errorf("failed to issue reset link: %w", err)
	}
	slog.Info("email sent", "kind", msg.Kind, "to", user.Email)
	return &msg.ID, nil
}

// GetAccountEmail returns an account email (not an order email) by ID.
func (s *authService) GetAccountEmail(ctx context.Context, id uuid.UUID) (*models.EmailMessage, error) {
	var msg models.EmailMessage
	err := s.db.WithContext(ctx).Where("id = ? AND user_id IS NOT NULL", id).First(&msg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	return &msg, err
}

// ResetPassword sets a new password using a reset link, then signs the user in. The link is
// single-use; every other open link for the account is closed too.
func (s *authService) ResetPassword(ctx context.Context, token, password string, guestID *string) (*dto.AuthResponse, error) {
	if len(password) < minPasswordLength {
		return nil, ErrWeakPassword
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	var user models.User
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var link models.PasswordResetToken
		err := tx.Where("token_hash = ?", hashResetToken(strings.TrimSpace(token))).First(&link).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResetLinkInvalid
		}
		if err != nil {
			return err
		}
		now := time.Now()
		if link.UsedAt != nil || now.After(link.ExpiresAt) {
			return ErrResetLinkInvalid
		}
		if err := tx.Model(&models.PasswordResetToken{}).
			Where("user_id = ? AND used_at IS NULL", link.UserID).
			Update("used_at", now).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.User{}).Where("id = ?", link.UserID).Update("password_hash", string(hashed)).Error; err != nil {
			return err
		}
		return tx.First(&user, "id = ?", link.UserID).Error
	})
	if err != nil {
		return nil, err
	}

	if guestID != nil && *guestID != "" {
		s.mergeGuestIntoUser(ctx, *guestID, user.ID)
	}
	jwt, err := middleware.GenerateJWT(&user, s.jwtSecret, 7*24*time.Hour)
	if err != nil {
		return nil, err
	}
	return &dto.AuthResponse{Token: jwt, User: *toUserDTO(&user)}, nil
}

// ChangePassword replaces a signed-in user's password after checking the current one.
func (s *authService) ChangePassword(ctx context.Context, userID uuid.UUID, current, next string) error {
	if len(next) < minPasswordLength {
		return ErrWeakPassword
	}
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return ErrUserNotFound
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(current)) != nil {
		return ErrWrongPassword
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	return s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).Update("password_hash", string(hashed)).Error
}
