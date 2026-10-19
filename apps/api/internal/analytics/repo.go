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

// today = "hari ini" menurut WIB, bukan menurut timezone server Postgres.
// `CURRENT_DATE` ikut TZ server (umumnya UTC di VPS), jadi kunjungan antara
// 00:00–07:00 WIB akan masuk bucket kemarin — "Views hari ini" terlihat
// tertinggal sampai siang. Konstanta compile-time, bukan input user, jadi
// aman digabung ke string SQL.
//
// Indonesia punya 3 zona; WIB dipilih karena mayoritas pengguna. Kalau nanti
// butuh per-situs, jadikan ini kolom di `sites` dan pass sebagai parameter.
const today = `(now() AT TIME ZONE 'Asia/Jakarta')::date`

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
		VALUES ($1, $2, `+today+`, 1)
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
	//
	// `$2::int` wajib: versi lama pakai `($2 || ' days')::interval`, yang bikin
	// Postgres infer $2 sebagai text dan pgx gagal encode Go int ke OID text —
	// seluruh endpoint summary balas 500. `>` (bukan `>=`) supaya window-nya pas
	// N hari termasuk hari ini, bukan N+1.
	dailyRows, err := r.pool.Query(ctx, `
		SELECT date, SUM(view_count)::bigint AS total
		  FROM analytics_page_views
		 WHERE site_id = $1
		   AND date > `+today+` - $2::int
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
	if err := dailyRows.Err(); err != nil {
		return nil, err
	}

	// Top pages — sum per page_slug dalam window.
	topRows, err := r.pool.Query(ctx, `
		SELECT page_slug, SUM(view_count)::bigint AS total
		  FROM analytics_page_views
		 WHERE site_id = $1
		   AND date > `+today+` - $2::int
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
	if err := topRows.Err(); err != nil {
		return nil, err
	}

	// Quick counters today + yesterday untuk headline card.
	var viewsToday, viewsYesterday int64
	_ = r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(view_count), 0) FROM analytics_page_views
		  WHERE site_id = $1 AND date = `+today, siteID,
	).Scan(&viewsToday)
	_ = r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(view_count), 0) FROM analytics_page_views
		  WHERE site_id = $1 AND date = `+today+` - 1`, siteID,
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
