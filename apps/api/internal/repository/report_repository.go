package repository

import (
	"context"
	"fmt"
	"time"

	"aura-tech/api/internal/dto"

	"gorm.io/gorm"
)

// Orders count as sales once paid: every status except awaiting payment and cancelled. An order
// cancelled after payment is a refund; the stock ledger marks those with CANCEL_RESTOCK.
const paidOrder = "o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')"
const refundedOrder = "o.status = 'CANCELLED' AND EXISTS (SELECT 1 FROM stock_movements m WHERE m.order_id = o.id AND m.reason = 'CANCEL_RESTOCK')"

// storeTime converts order times to Thai local time for grouping by store day.
const storeTime = "(o.created_at AT TIME ZONE 'Asia/Bangkok')"

// SalesOrderLine is one item of an order, for the sales CSV export.
type SalesOrderLine struct {
	OrderNumber    string
	CreatedAt      time.Time
	Status         string
	CustomerEmail  string
	PaymentMethod  string
	ShippingRaw    []byte
	Carrier        string
	TrackingNumber string
	GrandTotal     int64
	SKU            string
	Name           string
	SpecSummary    string
	Quantity       int
	UnitPrice      int64
}

type ReportRepository interface {
	// SalesReport covers [from, to) in store time, grouped by day, week or month.
	SalesReport(ctx context.Context, from, to time.Time, group string) (*dto.SalesReport, error)
	// SalesLines lists every item of orders paid or refunded in [from, to), oldest first.
	SalesLines(ctx context.Context, from, to time.Time) ([]SalesOrderLine, error)
}

type reportRepository struct {
	db *gorm.DB
}

func NewReportRepository(db *gorm.DB) ReportRepository {
	return &reportRepository{db: db}
}

func (r *reportRepository) totals(db *gorm.DB, from, to time.Time) (dto.SalesTotals, error) {
	var t dto.SalesTotals
	err := db.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE `+paidOrder+`) AS orders,
			COALESCE(SUM(o.grand_total) FILTER (WHERE `+paidOrder+`), 0) AS revenue_satang,
			COUNT(*) FILTER (WHERE `+refundedOrder+`) AS refunded_orders,
			COALESCE(SUM(o.grand_total) FILTER (WHERE `+refundedOrder+`), 0) AS refunded_satang,
			COUNT(*) FILTER (WHERE `+paidOrder+` AND NOT EXISTS (
				SELECT 1 FROM orders e WHERE LOWER(e.customer_email) = LOWER(o.customer_email)
				AND e.created_at < o.created_at AND e.status NOT IN ('PENDING_PAYMENT', 'CANCELLED'))) AS new_customer_orders
		FROM orders o WHERE o.created_at >= ? AND o.created_at < ?`, from, to).Scan(&t).Error
	if err != nil {
		return t, err
	}
	err = db.Raw(`SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i JOIN orders o ON o.id = i.order_id
		WHERE `+paidOrder+` AND o.created_at >= ? AND o.created_at < ?`, from, to).Scan(&t.Units).Error
	if t.Orders > 0 {
		t.AvgOrderSatang = t.RevenueSatang / t.Orders
	}
	return t, err
}

func (r *reportRepository) SalesReport(ctx context.Context, from, to time.Time, group string) (*dto.SalesReport, error) {
	db := r.db.WithContext(ctx)
	rep := &dto.SalesReport{Group: group, Series: []dto.SalesPeriod{}, Products: []dto.SalesBreakdown{}, Category: []dto.SalesBreakdown{}, Payments: []dto.SalesBreakdown{}}
	var err error
	if rep.Totals, err = r.totals(db, from, to); err != nil {
		return nil, fmt.Errorf("sales totals: %w", err)
	}
	if rep.Previous, err = r.totals(db, from.Add(-to.Sub(from)), from); err != nil {
		return nil, fmt.Errorf("previous totals: %w", err)
	}

	// Revenue by period. Units come from a per-order subquery so they don't multiply revenue.
	var periods []struct {
		Start         time.Time
		Orders, Units int64
		RevenueSatang int64
	}
	err = db.Raw(`
		SELECT date_trunc(?, `+storeTime+`) AS start, COUNT(*) AS orders,
			COALESCE(SUM(o.grand_total), 0) AS revenue_satang,
			COALESCE(SUM((SELECT SUM(i.quantity) FROM order_items i WHERE i.order_id = o.id)), 0) AS units
		FROM orders o WHERE `+paidOrder+` AND o.created_at >= ? AND o.created_at < ?
		GROUP BY 1 ORDER BY 1`, group, from, to).Scan(&periods).Error
	if err != nil {
		return nil, fmt.Errorf("sales series: %w", err)
	}
	byStart := map[string]dto.SalesPeriod{}
	for _, p := range periods {
		k := p.Start.Format("2006-01-02")
		byStart[k] = dto.SalesPeriod{Start: k, Orders: p.Orders, Units: p.Units, RevenueSatang: p.RevenueSatang}
	}
	// Every period in the range, including ones with no sales.
	for cur := periodStart(from, group); cur.Before(to); cur = nextPeriod(cur, group) {
		k := cur.Format("2006-01-02")
		p, ok := byStart[k]
		if !ok {
			p = dto.SalesPeriod{Start: k}
		}
		rep.Series = append(rep.Series, p)
	}

	lines := func(selectKey, joins, groupBy, order string, limit int, out *[]dto.SalesBreakdown) error {
		q := `SELECT ` + selectKey + `, COUNT(DISTINCT o.id) AS orders, COALESCE(SUM(i.quantity), 0) AS units,
				COALESCE(SUM(i.unit_price * i.quantity), 0) AS revenue_satang
			FROM order_items i JOIN orders o ON o.id = i.order_id ` + joins + `
			WHERE ` + paidOrder + ` AND o.created_at >= ? AND o.created_at < ?
			GROUP BY ` + groupBy + ` ORDER BY ` + order
		if limit > 0 {
			q += fmt.Sprintf(" LIMIT %d", limit)
		}
		return db.Raw(q, from, to).Scan(out).Error
	}
	if err := lines(`COALESCE(p.slug, i.sku_snapshot) AS key, COALESCE(p.name, i.name_snapshot) AS label`,
		`LEFT JOIN product_variants v ON v.id = i.variant_id LEFT JOIN products p ON p.id = v.product_id`,
		`1, 2`, `revenue_satang DESC, units DESC`, 10, &rep.Products); err != nil {
		return nil, fmt.Errorf("top products: %w", err)
	}
	if err := lines(`COALESCE(c.slug, 'unknown') AS key, COALESCE(c.name, 'Unknown') AS label`,
		`LEFT JOIN product_variants v ON v.id = i.variant_id LEFT JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id`,
		`1, 2`, `revenue_satang DESC`, 0, &rep.Category); err != nil {
		return nil, fmt.Errorf("categories: %w", err)
	}
	err = db.Raw(`SELECT o.payment_method AS key, o.payment_method AS label, COUNT(*) AS orders,
			COALESCE(SUM(o.grand_total), 0) AS revenue_satang
		FROM orders o WHERE `+paidOrder+` AND o.created_at >= ? AND o.created_at < ?
		GROUP BY 1, 2 ORDER BY revenue_satang DESC`, from, to).Scan(&rep.Payments).Error
	if err != nil {
		return nil, fmt.Errorf("payment methods: %w", err)
	}
	return rep, nil
}

// periodStart and nextPeriod mirror Postgres date_trunc for day, week (Monday) and month.
func periodStart(t time.Time, group string) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	switch group {
	case "week":
		return d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
	case "month":
		return time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, d.Location())
	}
	return d
}

func nextPeriod(t time.Time, group string) time.Time {
	switch group {
	case "week":
		return t.AddDate(0, 0, 7)
	case "month":
		return t.AddDate(0, 1, 0)
	}
	return t.AddDate(0, 0, 1)
}

func (r *reportRepository) SalesLines(ctx context.Context, from, to time.Time) ([]SalesOrderLine, error) {
	var rows []SalesOrderLine
	err := r.db.WithContext(ctx).Raw(`
		SELECT o.order_number, o.created_at, o.status, o.customer_email, o.payment_method,
			o.shipping_address AS shipping_raw, o.carrier, o.tracking_number, o.grand_total,
			i.sku_snapshot AS sku, i.name_snapshot AS name, i.spec_summary, i.quantity, i.unit_price
		FROM orders o JOIN order_items i ON i.order_id = o.id
		WHERE (`+paidOrder+` OR (`+refundedOrder+`)) AND o.created_at >= ? AND o.created_at < ?
		ORDER BY o.created_at, o.order_number, i.sku_snapshot`, from, to).Scan(&rows).Error
	return rows, err
}
