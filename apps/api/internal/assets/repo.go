package assets

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Asset struct {
	ID        uuid.UUID `json:"id"`
	SiteID    uuid.UUID `json:"site_id"`
	Kind      string    `json:"kind"`
	URL       string    `json:"url"`
	Size      int64     `json:"size"`
	Mime      string    `json:"mime"`
	CreatedAt time.Time `json:"created_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, kind, url, mime string, size int64) (*Asset, error) {
	var a Asset
	err := r.pool.QueryRow(ctx, `
		INSERT INTO assets (site_id, kind, url, size, mime) VALUES ($1,$2,$3,$4,$5)
		RETURNING id, site_id, kind, url, size, mime, created_at
	`, siteID, kind, url, size, mime).Scan(&a.ID, &a.SiteID, &a.Kind, &a.URL, &a.Size, &a.Mime, &a.CreatedAt)
	return &a, err
}

// CountAndSize returns the asset count and total bytes for a site.
func (r *Repo) CountAndSize(ctx context.Context, siteID uuid.UUID) (count int, totalBytes int64, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT count(*), COALESCE(sum(size), 0) FROM assets WHERE site_id = $1`,
		siteID,
	).Scan(&count, &totalBytes)
	return
}

// ListBySitePage returns one page of assets for a site (newest first), with optional
// MIME prefix filter via `like` (e.g. "image/%" or "%" for everything).
func (r *Repo) ListBySitePage(ctx context.Context, siteID uuid.UUID, like string, limit, offset int) ([]Asset, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM assets WHERE site_id = $1 AND LOWER(mime) LIKE $2`,
		siteID, like,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, site_id, kind, url, size, mime, created_at
		FROM assets WHERE site_id = $1 AND LOWER(mime) LIKE $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`, siteID, like, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.SiteID, &a.Kind, &a.URL, &a.Size, &a.Mime, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

// GetByID lookup asset by id — ownership check di caller (handler cek via
// sites.Repo). Return storage key untuk cleanup di storage layer.
func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Asset, error) {
	var a Asset
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, kind, url, size, mime, created_at
		  FROM assets WHERE id = $1
	`, id).Scan(&a.ID, &a.SiteID, &a.Kind, &a.URL, &a.Size, &a.Mime, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Delete hapus asset row. Storage cleanup (file di disk / S3) tanggung jawab
// caller — repo cuma urus DB. Return rowsAffected supaya caller bisa detect
// "sudah dihapus" case (idempotent).
func (r *Repo) Delete(ctx context.Context, id uuid.UUID) (int64, error) {
	ct, err := r.pool.Exec(ctx, `DELETE FROM assets WHERE id = $1`, id)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}

func (r *Repo) ListBySite(ctx context.Context, siteID uuid.UUID) ([]Asset, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, site_id, kind, url, size, mime, created_at
		FROM assets WHERE site_id = $1 ORDER BY created_at DESC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.SiteID, &a.Kind, &a.URL, &a.Size, &a.Mime, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
