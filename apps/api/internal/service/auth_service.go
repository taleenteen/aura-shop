package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/middleware"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserAlreadyExists  = errors.New("a user with this email already exists")
	ErrUserNotFound       = errors.New("user not found")
)

type AuthService interface {
	Register(ctx context.Context, req dto.RegisterRequest, guestID *string) (*dto.AuthResponse, error)
	Login(ctx context.Context, req dto.LoginRequest, guestID *string) (*dto.AuthResponse, error)
	GetProfile(ctx context.Context, userID uuid.UUID) (*dto.UserDTO, error)
	UpdateProfile(ctx context.Context, userID uuid.UUID, req dto.UpdateProfileRequest) (*dto.UserDTO, error)
	RequestPasswordReset(ctx context.Context, email string) (*uuid.UUID, error)
	GetAccountEmail(ctx context.Context, id uuid.UUID) (*models.EmailMessage, error)
	ResetPassword(ctx context.Context, token, password string, guestID *string) (*dto.AuthResponse, error)
	ChangePassword(ctx context.Context, userID uuid.UUID, current, next string) error
}

type authService struct {
	db           *gorm.DB
	userRepo     repository.UserRepository
	wishlistRepo repository.WishlistRepository
	cartRepo     repository.CartRepository
	jwtSecret    string
}

func NewAuthService(
	db *gorm.DB,
	userRepo repository.UserRepository,
	wishlistRepo repository.WishlistRepository,
	cartRepo repository.CartRepository,
	jwtSecret string,
) AuthService {
	return &authService{
		db:           db,
		userRepo:     userRepo,
		wishlistRepo: wishlistRepo,
		cartRepo:     cartRepo,
		jwtSecret:    jwtSecret,
	}
}

func (s *authService) Register(ctx context.Context, req dto.RegisterRequest, guestID *string) (*dto.AuthResponse, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || len(req.Password) < 6 {
		return nil, errors.New("valid email and password of at least 6 characters required")
	}

	existing, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserAlreadyExists
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &models.User{
		Email:        email,
		PasswordHash: string(hashedPassword),
		FullName:     strings.TrimSpace(req.FullName),
		Phone:        strings.TrimSpace(req.Phone),
		Role:         "CUSTOMER",
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	// Guest-to-User Merge in DB transaction
	if guestID != nil && *guestID != "" {
		s.mergeGuestIntoUser(ctx, *guestID, user.ID)
	}

	token, err := middleware.GenerateJWT(user, s.jwtSecret, 7*24*time.Hour)
	if err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		Token: token,
		User:  *toUserDTO(user),
	}, nil
}

func (s *authService) Login(ctx context.Context, req dto.LoginRequest, guestID *string) (*dto.AuthResponse, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Guest-to-User Merge in DB transaction
	if guestID != nil && *guestID != "" {
		s.mergeGuestIntoUser(ctx, *guestID, user.ID)
	}

	token, err := middleware.GenerateJWT(user, s.jwtSecret, 7*24*time.Hour)
	if err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		Token: token,
		User:  *toUserDTO(user),
	}, nil
}

func (s *authService) GetProfile(ctx context.Context, userID uuid.UUID) (*dto.UserDTO, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	return toUserDTO(user), nil
}

// mergeGuestIntoUser moves the browser's guest wishlist and cart onto the account in one
// transaction. A failure is logged and rolled back but does not block sign-in: the guest rows
// stay intact and merge on the next sign-in.
func (s *authService) mergeGuestIntoUser(ctx context.Context, guestID string, userID uuid.UUID) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.wishlistRepo.MergeGuestWishlist(ctx, tx, guestID, userID); err != nil {
			return err
		}
		return s.cartRepo.MergeGuestCart(ctx, tx, guestID, userID)
	})
	if err != nil {
		slog.Error("guest to user merge failed", "user_id", userID, "error", err)
	}
}

// ErrInvalidProfile is returned when profile fields are missing or too long.
var ErrInvalidProfile = errors.New("invalid profile")

func toUserDTO(user *models.User) *dto.UserDTO {
	return &dto.UserDTO{
		ID:        user.ID,
		Email:     user.Email,
		FullName:  user.FullName,
		Phone:     user.Phone,
		Address:   user.Address,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}
}

// UpdateProfile saves the user's name, phone and free-text address after trimming them.
func (s *authService) UpdateProfile(ctx context.Context, userID uuid.UUID, req dto.UpdateProfileRequest) (*dto.UserDTO, error) {
	fullName := strings.TrimSpace(req.FullName)
	phone := strings.TrimSpace(req.Phone)
	address := strings.TrimSpace(req.Address)
	switch {
	case fullName == "":
		return nil, fmt.Errorf("%w: full name is required", ErrInvalidProfile)
	case utf8.RuneCountInString(fullName) > 100:
		return nil, fmt.Errorf("%w: full name must be at most 100 characters", ErrInvalidProfile)
	case utf8.RuneCountInString(phone) > 30:
		return nil, fmt.Errorf("%w: phone must be at most 30 characters", ErrInvalidProfile)
	case utf8.RuneCountInString(address) > 1000:
		return nil, fmt.Errorf("%w: address must be at most 1000 characters", ErrInvalidProfile)
	}

	if err := s.userRepo.UpdateProfile(ctx, userID, fullName, phone, address); err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return s.GetProfile(ctx, userID)
}
