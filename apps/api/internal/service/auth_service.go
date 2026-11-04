package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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
		_ = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			_ = s.wishlistRepo.MergeGuestWishlist(ctx, tx, *guestID, user.ID)
			_ = s.cartRepo.MergeGuestCart(ctx, tx, *guestID, user.ID)
			return nil
		})
	}

	token, err := middleware.GenerateJWT(user, s.jwtSecret, 7*24*time.Hour)
	if err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		Token: token,
		User: dto.UserDTO{
			ID:        user.ID,
			Email:     user.Email,
			FullName:  user.FullName,
			Phone:     user.Phone,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
		},
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
		_ = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			_ = s.wishlistRepo.MergeGuestWishlist(ctx, tx, *guestID, user.ID)
			_ = s.cartRepo.MergeGuestCart(ctx, tx, *guestID, user.ID)
			return nil
		})
	}

	token, err := middleware.GenerateJWT(user, s.jwtSecret, 7*24*time.Hour)
	if err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		Token: token,
		User: dto.UserDTO{
			ID:        user.ID,
			Email:     user.Email,
			FullName:  user.FullName,
			Phone:     user.Phone,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
		},
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

	return &dto.UserDTO{
		ID:        user.ID,
		Email:     user.Email,
		FullName:  user.FullName,
		Phone:     user.Phone,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}
