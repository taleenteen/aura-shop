package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// AuditLog records one admin change: who did what to which record, and how each field changed.
type AuditLog struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ActorID     *uuid.UUID     `gorm:"type:uuid;index" json:"actor_id"`
	ActorEmail  string         `gorm:"type:varchar(254);not null;default:'';index" json:"actor_email"`
	Action      string         `gorm:"type:varchar(40);not null;index" json:"action"`      // e.g. product.update
	EntityType  string         `gorm:"type:varchar(20);not null;index" json:"entity_type"` // product, order, banner, ...
	EntityID    string         `gorm:"type:varchar(64);not null;default:'';index" json:"entity_id"`
	EntityLabel string         `gorm:"type:varchar(255);not null;default:''" json:"entity_label"` // name or number at the time
	Changes     datatypes.JSON `gorm:"type:jsonb" json:"changes"`                                 // []AuditChange
	CreatedAt   time.Time      `gorm:"index" json:"created_at"`
}

// AuditChange is one field's value before and after.
type AuditChange struct {
	Field string `json:"field"`
	From  string `json:"from"`
	To    string `json:"to"`
}
