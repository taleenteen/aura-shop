package repository

import (
	"context"
	"errors"
	"time"

	"aura-tech/api/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// IdempotencyRepository stores Idempotency-Key records; it satisfies middleware.IdempotencyStore.
type IdempotencyRepository struct {
	db *gorm.DB
}

func NewIdempotencyRepository(db *gorm.DB) *IdempotencyRepository {
	return &IdempotencyRepository{db: db}
}

// Claim inserts a pending record for (owner, key). When one already exists it returns that
// record and claimed=false. The insert and the conflict check are one statement, so two
// concurrent requests with the same key cannot both claim it.
func (r *IdempotencyRepository) Claim(ctx context.Context, owner, key, fingerprint string) (*models.IdempotencyKey, bool, error) {
	for attempt := 0; attempt < 2; attempt++ {
		rec := models.IdempotencyKey{Owner: owner, Key: key, Fingerprint: fingerprint}
		res := r.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&rec)
		if res.Error != nil {
			return nil, false, res.Error
		}
		if res.RowsAffected == 1 {
			return &rec, true, nil
		}
		var existing models.IdempotencyKey
		err := r.db.WithContext(ctx).First(&existing, "owner = ? AND key = ?", owner, key).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue // released between the insert and the read: claim again
		}
		return &existing, false, err
	}
	return nil, false, errors.New("could not claim idempotency key")
}

// Complete saves the response for later replays.
func (r *IdempotencyRepository) Complete(ctx context.Context, owner, key string, status int, body []byte) error {
	return r.db.WithContext(ctx).Model(&models.IdempotencyKey{}).
		Where("owner = ? AND key = ?", owner, key).
		Updates(map[string]any{"status_code": status, "body": body, "completed_at": time.Now()}).Error
}

// Release forgets a claim whose request failed on the server side, so the client may retry.
func (r *IdempotencyRepository) Release(ctx context.Context, owner, key string) error {
	return r.db.WithContext(ctx).Where("owner = ? AND key = ?", owner, key).Delete(&models.IdempotencyKey{}).Error
}

// DeleteOlderThan removes records created before the cutoff.
func (r *IdempotencyRepository) DeleteOlderThan(ctx context.Context, cutoff time.Time) (int64, error) {
	res := r.db.WithContext(ctx).Where("created_at < ?", cutoff).Delete(&models.IdempotencyKey{})
	return res.RowsAffected, res.Error
}
