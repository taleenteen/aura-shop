package models

import "time"

// IdempotencyKey remembers the response to a request sent with an Idempotency-Key header, so a
// retried checkout (double click, flaky network, reload) replays the first answer instead of
// creating a second order or charging twice. Rows are deleted after a day.
type IdempotencyKey struct {
	Owner       string     `gorm:"type:varchar(80);primaryKey" json:"owner"` // user:<id>, guest:<id> or ip:<addr>
	Key         string     `gorm:"type:varchar(255);primaryKey" json:"key"`
	Fingerprint string     `gorm:"type:char(64);not null" json:"fingerprint"` // sha256 of method, path and body
	StatusCode  int        `gorm:"not null;default:0" json:"status_code"`     // 0 while the first request runs
	Body        []byte     `gorm:"type:bytea" json:"-"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `gorm:"index" json:"created_at"`
}
