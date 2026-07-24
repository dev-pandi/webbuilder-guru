// Package analytics — MVP page-view counter dengan daily-bucket aggregation.
// UPSERT increment pattern menjaga row count kecil (per site: 30d × pages).
// Kalau nanti butuh visitor unique / referrer / bounce, tambah tabel session
// terpisah tanpa mengubah struktur ini.
package analytics

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// RecordView atomically increment counter untuk (site, page, today).
// UPSERT `ON CONFLICT DO UPDATE` — kalau row (site, date, page) belum ada,
// insert dengan count=1; kalau ada, increment. Race-safe (Postgres serialize
// per row).
//
// pageSlug: "" untuk homepage, "/about", "/blog/xxx" dst.
func (r *Repo) RecordView(ctx context.Context, siteID uuid.UUID, pageSlug string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO analytics_page_views (site_id, page_slug, date, view_count)
		VALUES ($1, $2, CURRENT_DATE, 1)
		ON CONFLICT (site_id, date, page_slug)
		DO UPDATE SET view_count = analytics_page_views.view_count + 1
	`, siteID, pageSlug)
	return err
}

// DailyPoint = 1 titik di chart trend.
type DailyPoint struct {
	Date  time.Time `json:"date"`  // truncate ke midnight
	Views int64     `json:"views"`
}

// PageTotal = agregat per page untuk "top pages".
type PageTotal struct {
	PageSlug string `json:"page_slug"`
	Views    int64  `json:"views"`
}

// Summary = payload lengkap untuk dashboard: chart daily + top pages + totals.
type Summary struct {
	TotalViews     int64        `json:"total_views"`      // total dalam window
	TotalDays      int          `json:"total_days"`       // window size
	Daily          []DailyPoint `json:"daily"`            // urut ASC by date
	TopPages       []PageTotal  `json:"top_pages"`        // max 10
	ViewsToday     int64        `json:"views_today"`
	ViewsYesterday int64        `json:"views_yesterday"`
}

// GetSummary hitung metrik untuk site dalam N hari terakhir.
func (r *Repo) GetSummary(ctx context.Context, siteID uuid.UUID, days int) (*Summary, error) {
	if days <= 0 || days > 365 {
		days = 30
	}

	// Daily trend — fill missing dates dengan 0 di caller (loop di frontend
	// atau di sini). Untuk MVP, biar frontend fill karena responsive rendering.
	dailyRows, err := r.pool.Query(ctx, `
		SELECT date, SUM(view_count)::bigint AS total
		  FROM analytics_page_views
		 WHERE site_id = $1
		   AND date >= CURRENT_DATE - ($2 || ' days')::interval
		 GROUP BY date
		 ORDER BY date ASC
	`, siteID, days)
	if err != nil {
		return nil, err
	}
	defer dailyRows.Close()
	daily := []DailyPoint{}
	var total int64
	for dailyRows.Next() {
		var p DailyPoint
		if err := dailyRows.Scan(&p.Date, &p.Views); err != nil {
			return nil, err
		}
		daily = append(daily, p)
		total += p.Views
	}

	// Top pages — sum per page_slug dalam window.
	topRows, err := r.pool.Query(ctx, `
		SELECT page_slug, SUM(view_count)::bigint AS total
		  FROM analytics_page_views
		 WHERE site_id = $1
		   AND date >= CURRENT_DATE - ($2 || ' days')::interval
		 GROUP BY page_slug
		 ORDER BY total DESC
		 LIMIT 10
	`, siteID, days)
	if err != nil {
		return nil, err
	}
	defer topRows.Close()
	tops := []PageTotal{}
	for topRows.Next() {
		var t PageTotal
		if err := topRows.Scan(&t.PageSlug, &t.Views); err != nil {
			return nil, err
		}
		tops = append(tops, t)
	}

	// Quick counters today + yesterday untuk headline card.
	var viewsToday, viewsYesterday int64
	_ = r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(view_count), 0) FROM analytics_page_views
		  WHERE site_id = $1 AND date = CURRENT_DATE`, siteID,
	).Scan(&viewsToday)
	_ = r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(view_count), 0) FROM analytics_page_views
		  WHERE site_id = $1 AND date = CURRENT_DATE - INTERVAL '1 day'`, siteID,
	).Scan(&viewsYesterday)

	return &Summary{
		TotalViews:     total,
		TotalDays:      days,
		Daily:          daily,
		TopPages:       tops,
		ViewsToday:     viewsToday,
		ViewsYesterday: viewsYesterday,
	}, nil
}
