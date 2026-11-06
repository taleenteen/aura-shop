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

// List godoc
//
//	@Summary		List the activity log
//	@Description	Returns a page of admin activity, newest first, with the before and after values of each change. `meta` carries page, limit, total_items and total_pages.
//	@Description	Dates are store dates (Thailand time); `to` is inclusive. Invalid dates are ignored.
//	@Tags			Admin · Activity
//	@Produce		json
//	@Security		BearerAuth
//	@Param			type	query		string	false	"Record type, e.g. order, product, banner"
//	@Param			actor	query		string	false	"Admin email (partial match)"
//	@Param			q		query		string	false	"Search by record name or ID (partial match)"
//	@Param			from	query		string	false	"Start date (YYYY-MM-DD)"							format(date)
//	@Param			to		query		string	false	"End date, inclusive (YYYY-MM-DD)"					format(date)
//	@Param			page	query		int		false	"Page number"										default(1)	minimum(1)
//	@Param			limit	query		int		false	"Page size (values outside 1-100 fall back to 30)"	default(30)	minimum(1)	maximum(100)
//	@Success		200		{object}	response.Envelope{data=[]models.AuditLog}
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/audit-logs [get]
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
