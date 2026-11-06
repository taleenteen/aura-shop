package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"aura-tech/api/internal/repository"
	"aura-tech/api/internal/response"
)

// ReportHandler serves the admin sales report and its CSV export.
type ReportHandler struct {
	repo repository.ReportRepository
}

func NewReportHandler(repo repository.ReportRepository) *ReportHandler {
	return &ReportHandler{repo: repo}
}

// reportRange reads ?from and ?to (YYYY-MM-DD, store dates, inclusive). Without them it covers
// the last 30 days including today. It returns [from, to) for queries.
func reportRange(w http.ResponseWriter, r *http.Request) (time.Time, time.Time, bool) {
	now := time.Now().In(storeZone)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, storeZone)
	from, to := today.AddDate(0, 0, -29), today
	q := r.URL.Query()
	fields := map[string]string{}
	if s := q.Get("from"); s != "" {
		if d, ok := storeDate(s); ok {
			from = d
		} else {
			fields["from"] = "Use a date like 2026-11-01."
		}
	}
	if s := q.Get("to"); s != "" {
		if d, ok := storeDate(s); ok {
			to = d
		} else {
			fields["to"] = "Use a date like 2026-11-30."
		}
	}
	if len(fields) == 0 && to.Before(from) {
		fields["to"] = "The end date must be on or after the start date."
	}
	if len(fields) == 0 && to.Sub(from) > 3*366*24*time.Hour {
		fields["from"] = "Choose a range of at most 3 years."
	}
	if len(fields) > 0 {
		response.ValidationFailed(w, "Check the date range.", fields)
		return time.Time{}, time.Time{}, false
	}
	return from, to.AddDate(0, 0, 1), true
}

// Sales godoc
//
//	@Summary		Get the sales report
//	@Description	Sales totals for the range (and for the same number of days just before it), a series grouped by day, week or month, and the top products, categories and payment methods.
//	@Description	Dates are store dates (Thailand time), inclusive. Without `from`/`to` the report covers the last 30 days including today. Ranges are limited to 3 years; grouping by day to 400 days.
//	@Tags			Admin · Reports
//	@Produce		json
//	@Security		BearerAuth
//	@Param			from	query		string	false	"Start date (YYYY-MM-DD)"			format(date)
//	@Param			to		query		string	false	"End date, inclusive (YYYY-MM-DD)"	format(date)
//	@Param			group	query		string	false	"Series grouping"					Enums(day, week, month)	default(day)
//	@Success		200		{object}	response.Envelope{data=dto.SalesReport}
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED (error.fields.from, error.fields.to or error.fields.group)"
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/reports/sales [get]
func (h *ReportHandler) Sales(w http.ResponseWriter, r *http.Request) {
	from, to, ok := reportRange(w, r)
	if !ok {
		return
	}
	group := r.URL.Query().Get("group")
	switch group {
	case "", "day":
		group = "day"
		if to.Sub(from) > 400*24*time.Hour {
			response.ValidationFailed(w, "Too many days to show one by one.", map[string]string{"group": "Group by week or month for ranges over 400 days."})
			return
		}
	case "week", "month":
	default:
		response.ValidationFailed(w, "Choose day, week or month.", map[string]string{"group": "Choose day, week or month."})
		return
	}
	rep, err := h.repo.SalesReport(r.Context(), from, to, group)
	if err != nil {
		slog.Error("sales report failed", "error", err)
		response.InternalServerError(w, "could not build the report")
		return
	}
	rep.From, rep.To = from.Format("2006-01-02"), to.AddDate(0, 0, -1).Format("2006-01-02")
	response.Success(w, http.StatusOK, rep, nil)
}

func bahtCell(satang int64) string {
	return fmt.Sprintf("%d.%02d", satang/100, satang%100)
}

// Export godoc
//
//	@Summary		Export sales as CSV
//	@Description	Downloads one row per order item of paid and refunded (cancelled after payment) orders in the range, as UTF-8 CSV with a BOM.
//	@Description	Columns: order_number, date, status, refunded, customer_email, recipient, province, payment_method, sku, product, option, quantity, unit_price, line_total, order_total, carrier, tracking_number (amounts in baht).
//	@Description	Same date range rules as GET /admin/reports/sales.
//	@Tags			Admin · Reports
//	@Produce		text/csv
//	@Security		BearerAuth
//	@Param			from	query		string	false	"Start date (YYYY-MM-DD)"			format(date)
//	@Param			to		query		string	false	"End date, inclusive (YYYY-MM-DD)"	format(date)
//	@Success		200		{file}		file
//	@Failure		400		{object}	response.Envelope	"VALIDATION_FAILED (error.fields.from or error.fields.to)"
//	@Failure		401		{object}	response.Envelope
//	@Failure		403		{object}	response.Envelope
//	@Failure		500		{object}	response.Envelope
//	@Router			/admin/reports/sales/export [get]
func (h *ReportHandler) Export(w http.ResponseWriter, r *http.Request) {
	from, to, ok := reportRange(w, r)
	if !ok {
		return
	}
	rows, err := h.repo.SalesLines(r.Context(), from, to)
	if err != nil {
		slog.Error("sales export failed", "error", err)
		response.InternalServerError(w, "could not export sales")
		return
	}
	name := fmt.Sprintf("aura-sales-%s-to-%s.csv", from.Format("2006-01-02"), to.AddDate(0, 0, -1).Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	_, _ = w.Write([]byte(string(rune(0xFEFF)))) // UTF-8 BOM so Excel shows Thai text
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"order_number", "date", "status", "refunded", "customer_email", "recipient", "province", "payment_method",
		"sku", "product", "option", "quantity", "unit_price", "line_total", "order_total", "carrier", "tracking_number"})
	for _, l := range rows {
		var addr struct {
			RecipientName string `json:"recipient_name"`
			Province      string `json:"province"`
		}
		_ = json.Unmarshal(l.ShippingRaw, &addr)
		refunded := "no"
		if l.Status == "CANCELLED" {
			refunded = "yes"
		}
		_ = cw.Write([]string{
			l.OrderNumber, l.CreatedAt.In(storeZone).Format("2006-01-02 15:04"), l.Status, refunded, l.CustomerEmail,
			addr.RecipientName, addr.Province, l.PaymentMethod, l.SKU, l.Name, l.SpecSummary, strconv.Itoa(l.Quantity),
			bahtCell(l.UnitPrice), bahtCell(l.UnitPrice * int64(l.Quantity)), bahtCell(l.GrandTotal), l.Carrier, strings.TrimSpace(l.TrackingNumber),
		})
	}
	cw.Flush()
}
