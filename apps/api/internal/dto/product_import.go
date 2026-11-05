package dto

import "github.com/google/uuid"

// ImportColumn documents one column of the product CSV, for the guide and the template.
type ImportColumn struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Level       string `json:"level"`        // "product" (same on every row of a product) or "variant"
	RequiredNew bool   `json:"required_new"` // needed when the row creates a product or option
	Format      string `json:"format"`
	Example     string `json:"example"`
	Notes       string `json:"notes"`
}

// ImportRequest carries the CSV text. Filename is only used in notes and messages.
type ImportRequest struct {
	Filename string `json:"filename"`
	CSV      string `json:"csv"`
}

// ImportDecision is the admin's choice for one product of the file.
type ImportDecision struct {
	// "update" (apply to the matched product), "create" (add as a new product) or "skip".
	Action string `json:"action"`
	// Change keys (see ImportChange.Key) to leave as they are in the store.
	Keep []string `json:"keep"`
}

type ImportCommitRequest struct {
	ImportRequest
	Decisions map[string]ImportDecision `json:"decisions"` // by ImportProduct.Key
}

// ImportIssue is a problem in the file, pointing at a spreadsheet row (1 = header) and column.
type ImportIssue struct {
	Row     int    `json:"row"`
	Column  string `json:"column,omitempty"`
	Message string `json:"message"`
}

// ImportChange is one value the file would change on an existing product or option.
type ImportChange struct {
	Key      string `json:"key"`           // e.g. "name", "sku:MBA13-M3-16-256-MN:price"
	SKU      string `json:"sku,omitempty"` // set for option-level changes
	Label    string `json:"label"`
	Current  string `json:"current"`
	Incoming string `json:"incoming"`
}

// ImportMatch is an existing product the file's product might mean.
type ImportMatch struct {
	ID   uuid.UUID `json:"id"`
	Slug string    `json:"slug"`
	Name string    `json:"name"`
}

// ImportProduct is how the file's rows for one product compare with the store.
type ImportProduct struct {
	Key  string `json:"key"`
	Rows []int  `json:"rows"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	// create | update | unchanged | name_match | error
	Status   string         `json:"status"`
	Existing *ImportMatch   `json:"existing,omitempty"` // matched by slug, or the name match
	Changes  []ImportChange `json:"changes"`
	NewSKUs  []string       `json:"new_skus"`
	Issues   []ImportIssue  `json:"issues"`
}

type ImportSummary struct {
	Rows      int `json:"rows"`
	Products  int `json:"products"`
	Create    int `json:"create"`
	Update    int `json:"update"`
	Unchanged int `json:"unchanged"`
	NameMatch int `json:"name_match"`
	Errors    int `json:"errors"`
}

type ImportPreview struct {
	Summary  ImportSummary   `json:"summary"`
	Products []ImportProduct `json:"products"`
	// Problems with the file as a whole (encoding, missing columns); nothing can be imported.
	FileIssues []ImportIssue `json:"file_issues"`
	Warnings   []string      `json:"warnings"`
}

// ImportOutcome reports what happened to one product on commit.
type ImportOutcome struct {
	Key       string     `json:"key"`
	Name      string     `json:"name"`
	Status    string     `json:"status"` // created | updated | skipped | unchanged | failed
	ProductID *uuid.UUID `json:"product_id,omitempty"`
	Message   string     `json:"message,omitempty"`
}

type ImportResult struct {
	Created  int             `json:"created"`
	Updated  int             `json:"updated"`
	Skipped  int             `json:"skipped"`
	Failed   int             `json:"failed"`
	Outcomes []ImportOutcome `json:"outcomes"`
}
