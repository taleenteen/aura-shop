package handler

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
	"aura-tech/api/internal/service"
)

// AuditHandler serves the admin activity log.
type AuditHandler struct {
	svc service.AuditService
}

func NewAuditHandler(svc service.AuditService) *AuditHandler {
	return &AuditHandler{svc: svc}
}

// List returns a page of the log. Filters: type, actor (email), q (record name), from and to
// (YYYY-MM-DD, store time; to is inclusive).
func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	page, limit := pageParams(r, 30, 100)
	q := r.URL.Query()
	f := repository.AuditFilter{
		EntityType: strings.TrimSpace(q.Get("type")),
		Actor:      strings.TrimSpace(q.Get("actor")),
		Search:     strings.TrimSpace(q.Get("q")),
		Page:       page,
		Limit:      limit,
	}
	if d, ok := storeDate(q.Get("from")); ok {
		f.From = &d
	}
	if d, ok := storeDate(q.Get("to")); ok {
		end := d.AddDate(0, 0, 1)
		f.To = &end
	}
	rows, total, err := h.svc.List(r.Context(), f)
	if err != nil {
		slog.Error("audit list failed", "error", err)
		response.InternalServerError(w, "could not load the activity log")
		return
	}
	response.Success(w, http.StatusOK, rows, pageMeta(page, limit, total))
}

// storeZone is Thailand time (no DST); dates in admin filters are store dates.
var storeZone = time.FixedZone("ICT", 7*60*60)

func storeDate(s string) (time.Time, bool) {
	d, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(s), storeZone)
	return d, err == nil
}
