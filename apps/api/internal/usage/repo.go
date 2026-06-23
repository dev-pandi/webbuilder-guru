package usage

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/sites"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Usage is the live usage snapshot for a site.
type Usage struct {
	SiteID  uuid.UUID `json:"site_id"`
	Pages   Metric    `json:"pages"`
	Assets  Metric    `json:"assets"`
	Storage Metric    `json:"storage_bytes"`
	At      time.Time `json:"at"`
}

// Metric is a used/max pair (max=0 means no limit; rarely used here).
type Metric struct {
	Used int64 `json:"used"`
	Max  int64 `json:"max"`
}

// Snapshot is one row from site_usage_snapshots.
type Snapshot struct {
	ID           int64     `json:"id"`
	SiteID       uuid.UUID `json:"site_id"`
	PagesCount   int       `json:"pages_count"`
	AssetsCount  int       `json:"assets_count"`
	StorageBytes int64     `json:"storage_bytes"`
	CapturedAt   time.Time `json:"captured_at"`
}

type Repo struct {
	pool   *pgxpool.Pool
	sites  *sites.Repo
	pages  *pages.Repo
	assets *assets.Repo
}

func NewRepo(p *pgxpool.Pool, s *sites.Repo, pg *pages.Repo, a *assets.Repo) *Repo {
	return &Repo{pool: p, sites: s, pages: pg, assets: a}
}

var ErrNotFound = errors.New("site not found")

// Compute returns the current usage for a site (without owner check).
func (r *Repo) Compute(ctx context.Context, site *sites.Site) (*Usage, error) {
	pCount, err := r.pages.CountBySite(ctx, site.ID)
	if err != nil {
		return nil, err
	}
	aCount, aBytes, err := r.assets.CountAndSize(ctx, site.ID)
	if err != nil {
		return nil, err
	}
	return &Usage{
		SiteID:  site.ID,
		Pages:   Metric{Used: int64(pCount), Max: int64(site.QuotaMaxPages)},
		Assets:  Metric{Used: int64(aCount), Max: 0},
		Storage: Metric{Used: aBytes, Max: site.QuotaMaxStorageBytes},
		At:      time.Now(),
	}, nil
}

// SaveSnapshot writes one snapshot row (idempotent per call, append-only).
func (r *Repo) SaveSnapshot(ctx context.Context, u *Usage) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO site_usage_snapshots (site_id, pages_count, assets_count, storage_bytes)
		VALUES ($1, $2, $3, $4)
	`, u.SiteID, u.Pages.Used, u.Assets.Used, u.Storage.Used)
	return err
}

// ListSnapshots returns up to `limit` recent snapshots for a site, newest first.
func (r *Repo) ListSnapshots(ctx context.Context, siteID uuid.UUID, limit int) ([]Snapshot, error) {
	if limit <= 0 || limit > 365 {
		limit = 30
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, site_id, pages_count, assets_count, storage_bytes, captured_at
		FROM site_usage_snapshots
		WHERE site_id = $1
		ORDER BY captured_at DESC
		LIMIT $2
	`, siteID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Snapshot{}
	for rows.Next() {
		var s Snapshot
		if err := rows.Scan(&s.ID, &s.SiteID, &s.PagesCount, &s.AssetsCount, &s.StorageBytes, &s.CapturedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// PruneOldSnapshots keeps DB tidy — keep only the last `keep` rows per site.
// Safe to call periodically; ignored when there are fewer rows than keep.
func (r *Repo) PruneOldSnapshots(ctx context.Context, siteID uuid.UUID, keep int) error {
	if keep <= 0 {
		keep = 100
	}
	_, err := r.pool.Exec(ctx, `
		DELETE FROM site_usage_snapshots
		WHERE site_id = $1
		  AND id NOT IN (
		    SELECT id FROM site_usage_snapshots WHERE site_id = $1
		    ORDER BY captured_at DESC LIMIT $2
		  )
	`, siteID, keep)
	return err
}
