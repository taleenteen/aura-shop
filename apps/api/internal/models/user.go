package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	FullName     string    `gorm:"not null" json:"full_name"`
	Phone        string    `json:"phone"`
	Address      string    `gorm:"type:text;not null;default:''" json:"address"`    // free-text delivery address
	Role         string    `gorm:"type:varchar(20);default:'CUSTOMER'" json:"role"` // CUSTOMER, ADMIN
	// TokenVersion is copied into each JWT; raising it signs the user out everywhere.
	TokenVersion int `gorm:"not null;default:0" json:"-"`
	// FailedLogins counts wrong passwords in a row; LockedUntil blocks sign-in after too many.
	FailedLogins int        `gorm:"not null;default:0" json:"-"`
	LockedUntil  *time.Time `json:"-"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
