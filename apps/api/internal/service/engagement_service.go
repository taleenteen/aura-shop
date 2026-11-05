package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"aura-tech/api/internal/dto"
	"aura-tech/api/internal/models"
	"aura-tech/api/internal/repository"

	"github.com/google/uuid"
)

// EngagementService covers back-in-stock alerts, the account inbox and product reviews.
type EngagementService interface {
	SubscribeStockAlert(ctx context.Context, userID, variantID uuid.UUID) error
	UnsubscribeStockAlert(ctx context.Context, userID, variantID uuid.UUID) error
	ListStockAlerts(ctx context.Context, userID uuid.UUID) ([]dto.StockAlertView, error)
	ListAccountEmails(ctx context.Context, userID uuid.UUID) ([]models.EmailMessage, error)

	ProductReviews(ctx context.Context, slug string, page, limit int, viewer *uuid.UUID) (*dto.ProductReviews, int64, error)
	SaveReview(ctx context.Context, slug string, userID uuid.UUID, in dto.ReviewInput) error
	DeleteReview(ctx context.Context, slug string, userID uuid.UUID) error
	ListReviewsAdmin(ctx context.Context, filter dto.AdminReviewFilter) ([]dto.AdminReview, int64, error)
	SetReviewHidden(ctx context.Context, id uuid.UUID, hidden bool) error
}

type engagementService struct {
	repo repository.EngagementRepository
}

func NewEngagementService(repo repository.EngagementRepository) EngagementService {
	return &engagementService{repo: repo}
}

func (s *engagementService) SubscribeStockAlert(ctx context.Context, userID, variantID uuid.UUID) error {
	return s.repo.CreateStockAlert(ctx, userID, variantID)
}

func (s *engagementService) UnsubscribeStockAlert(ctx context.Context, userID, variantID uuid.UUID) error {
	return s.repo.DeleteStockAlert(ctx, userID, variantID)
}

func (s *engagementService) ListStockAlerts(ctx context.Context, userID uuid.UUID) ([]dto.StockAlertView, error) {
	rows, err := s.repo.ListStockAlerts(ctx, userID)
	if rows == nil && err == nil {
		rows = []dto.StockAlertView{}
	}
	return rows, err
}

func (s *engagementService) ListAccountEmails(ctx context.Context, userID uuid.UUID) ([]models.EmailMessage, error) {
	msgs, err := s.repo.ListAccountEmails(ctx, userID, 50)
	if msgs == nil && err == nil {
		msgs = []models.EmailMessage{}
	}
	return msgs, err
}

// publicName shows a reviewer as first name and last initial ("Somchai P.").
func publicName(full string) string {
	parts := strings.Fields(full)
	switch len(parts) {
	case 0:
		return "Verified buyer"
	case 1:
		return parts[0]
	}
	last, _ := utf8.DecodeRuneInString(parts[len(parts)-1])
	return parts[0] + " " + string(last) + "."
}

func (s *engagementService) ProductReviews(ctx context.Context, slug string, page, limit int, viewer *uuid.UUID) (*dto.ProductReviews, int64, error) {
	productID, err := s.repo.ProductIDBySlug(ctx, slug)
	if err != nil {
		return nil, 0, err
	}
	summary, err := s.repo.ReviewSummary(ctx, productID)
	if err != nil {
		return nil, 0, err
	}
	reviews, total, err := s.repo.ListReviews(ctx, productID, page, limit)
	if err != nil {
		return nil, 0, err
	}
	if reviews == nil {
		reviews = []dto.ReviewView{}
	}
	for i := range reviews {
		reviews[i].AuthorName = publicName(reviews[i].AuthorName)
	}
	out := &dto.ProductReviews{Summary: summary, Reviews: reviews}

	if viewer != nil {
		mine, err := s.repo.GetUserReview(ctx, productID, *viewer)
		if err != nil {
			return nil, 0, err
		}
		received, err := s.repo.HasReceivedProduct(ctx, productID, *viewer)
		if err != nil {
			return nil, 0, err
		}
		out.Viewer = &dto.ReviewViewer{CanReview: received}
		if mine != nil {
			out.Viewer.MyReview = &dto.ReviewMine{Rating: mine.Rating, Title: mine.Title, Body: mine.Body, IsHidden: mine.IsHidden}
		}
	}
	return out, total, nil
}

func (s *engagementService) SaveReview(ctx context.Context, slug string, userID uuid.UUID, in dto.ReviewInput) error {
	f := map[string]string{}
	title := strings.TrimSpace(in.Title)
	body := strings.TrimSpace(in.Body)
	if in.Rating < 1 || in.Rating > 5 {
		f["rating"] = "Choose 1 to 5 stars."
	}
	if utf8.RuneCountInString(title) > 120 {
		f["title"] = "Keep the title under 120 characters."
	}
	if utf8.RuneCountInString(body) > 2000 {
		f["body"] = "Keep the review under 2,000 characters."
	}
	if len(f) > 0 {
		return &ValidationError{Fields: f}
	}

	productID, err := s.repo.ProductIDBySlug(ctx, slug)
	if err != nil {
		return err
	}
	received, err := s.repo.HasReceivedProduct(ctx, productID, userID)
	if err != nil {
		return err
	}
	if !received {
		return repository.ErrReviewNotAllowed
	}
	return s.repo.UpsertReview(ctx, &models.Review{ProductID: productID, UserID: userID, Rating: in.Rating, Title: title, Body: body})
}

func (s *engagementService) DeleteReview(ctx context.Context, slug string, userID uuid.UUID) error {
	productID, err := s.repo.ProductIDBySlug(ctx, slug)
	if err != nil {
		return err
	}
	return s.repo.DeleteUserReview(ctx, productID, userID)
}

func (s *engagementService) ListReviewsAdmin(ctx context.Context, filter dto.AdminReviewFilter) ([]dto.AdminReview, int64, error) {
	rows, total, err := s.repo.ListReviewsAdmin(ctx, filter)
	if rows == nil && err == nil {
		rows = []dto.AdminReview{}
	}
	return rows, total, err
}

func (s *engagementService) SetReviewHidden(ctx context.Context, id uuid.UUID, hidden bool) error {
	return s.repo.SetReviewHidden(ctx, id, hidden)
}
