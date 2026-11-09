package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Sign-in lockout: after maxFailedLogins wrong passwords in a row the account refuses sign-in
// for lockDuration, even with the right password. This stops password guessing that the
// per-IP rate limit cannot see, such as one guess each from many addresses. A password reset
// lifts the lock at once, so a locked-out owner is never stuck.
const (
	maxFailedLogins = 5
	lockDuration    = 15 * time.Minute
)

// sessionTTL is how long a sign-in token stays valid.
const sessionTTL = 7 * 24 * time.Hour

// ErrAccountLocked matches AccountLockedError with errors.Is.
var ErrAccountLocked = errors.New("account temporarily locked")

// AccountLockedError says until when sign-in is blocked.
type AccountLockedError struct {
	Until time.Time
}

func (e *AccountLockedError) Error() string {
	return fmt.Sprintf("account locked until %s", e.Until.Format(time.RFC3339))
}

func (e *AccountLockedError) Is(target error) bool { return target == ErrAccountLocked }

var (
	dummyHashOnce sync.Once
	dummyHash     []byte
)

// compareWithDummyHash spends the same bcrypt time as a real password check, so an unknown
// email answers as slowly as a wrong password and response times do not reveal which emails
// have accounts.
func compareWithDummyHash(password string) {
	dummyHashOnce.Do(func() {
		dummyHash, _ = bcrypt.GenerateFromPassword([]byte("aura-tech-timing-equaliser"), bcrypt.DefaultCost)
	})
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
}

// recordFailedLogin counts one wrong password and locks the account on the last allowed try.
// It runs as one UPDATE, so parallel guesses cannot slip past the limit. A count left over
// from an expired lock starts again at one. It returns the lock end when the account is now
// locked.
func (s *authService) recordFailedLogin(ctx context.Context, userID uuid.UUID, now time.Time) (*time.Time, error) {
	var row struct{ LockedUntil *time.Time }
	err := s.db.WithContext(ctx).Raw(`
		UPDATE users SET
			failed_logins = CASE WHEN locked_until IS NOT NULL AND locked_until <= @now THEN 1 ELSE failed_logins + 1 END,
			locked_until  = CASE
				WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= @now THEN 1 ELSE failed_logins + 1 END) >= @max
				THEN CAST(@until AS timestamptz) ELSE NULL END
		WHERE id = @id
		RETURNING locked_until`,
		map[string]any{"now": now, "max": maxFailedLogins, "until": now.Add(lockDuration), "id": userID},
	).Scan(&row).Error
	return row.LockedUntil, err
}

// clearFailedLogins resets the count after a successful sign-in.
func (s *authService) clearFailedLogins(ctx context.Context, userID uuid.UUID) error {
	return s.db.WithContext(ctx).Exec(
		"UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", userID,
	).Error
}
