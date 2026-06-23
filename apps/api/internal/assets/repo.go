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
