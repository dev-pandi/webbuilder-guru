package admin

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")

// ---------- Users ----------

type UserRow struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	SiteCount int       `json:"site_count"`
}

func (r *Repo) ListUsers(ctx context.Context) ([]UserRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.email, u.name, u.role, u.created_at, COUNT(s.id) AS site_count
		FROM users u
		LEFT JOIN sites s ON s.user_id = u.id
		GROUP BY u.id
		ORDER BY u.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &u.SiteCount); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *Repo) UpdateUserRole(ctx context.Context, id uuid.UUID, role string) error {
	ct, err := r.pool.Exec(ctx, `UPDATE users SET role = $1, updated_at = now() WHERE id = $2`, role, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) DeleteUser(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------- Sites ----------

type SiteRow struct {
	ID                   uuid.UUID `json:"id"`
	Slug                 string    `json:"slug"`
	Name                 string    `json:"name"`
	Status               string    `json:"status"`
	OwnerID              uuid.UUID `json:"owner_id"`
	OwnerEmail           string    `json:"owner_email"`
	PagesCount           int       `json:"pages_count"`
	AssetsCount          int       `json:"assets_count"`
	StorageBytes         int64     `json:"storage_bytes"`
	QuotaMaxPages        int       `json:"quota_max_pages"`
	QuotaMaxStorageBytes int64     `json:"quota_max_storage_bytes"`
	CreatedAt            time.Time `json:"created_at"`
}

func (r *Repo) ListSites(ctx context.Context) ([]SiteRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.id, s.slug, s.name, s.status,
		       s.user_id, u.email,
		       COALESCE(p.cnt, 0)   AS pages_count,
		       COALESCE(a.cnt, 0)   AS assets_count,
		       COALESCE(a.bytes, 0) AS storage_bytes,
		       s.quota_max_pages, s.quota_max_storage_bytes,
		       s.created_at
		FROM sites s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN (SELECT site_id, COUNT(*) AS cnt FROM pages GROUP BY site_id) p ON p.site_id = s.id
		LEFT JOIN (SELECT site_id, COUNT(*) AS cnt, COALESCE(SUM(size), 0) AS bytes FROM assets GROUP BY site_id) a ON a.site_id = s.id
		ORDER BY s.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SiteRow{}
	for rows.Next() {
		var s SiteRow
		if err := rows.Scan(
			&s.ID, &s.Slug, &s.Name, &s.Status,
			&s.OwnerID, &s.OwnerEmail,
			&s.PagesCount, &s.AssetsCount, &s.StorageBytes,
			&s.QuotaMaxPages, &s.QuotaMaxStorageBytes,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repo) UpdateSiteQuota(ctx context.Context, id uuid.UUID, maxPages *int, maxStorageBytes *int64) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE sites SET
		    quota_max_pages         = COALESCE($2, quota_max_pages),
		    quota_max_storage_bytes = COALESCE($3, quota_max_storage_bytes),
		    updated_at              = now()
		WHERE id = $1
	`, id, maxPages, maxStorageBytes)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) DeleteSite(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM sites WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------- Stats ----------

type Stats struct {
	UserCount         int   `json:"user_count"`
	AdminCount        int   `json:"admin_count"`
	SiteCount         int   `json:"site_count"`
	PublishedSites    int   `json:"published_sites"`
	PageCount         int   `json:"page_count"`
	DomainCount       int   `json:"domain_count"`
	VerifiedDomains   int   `json:"verified_domains"`
	AssetCount        int   `json:"asset_count"`
	TotalStorageBytes int64 `json:"total_storage_bytes"`
}

func (r *Repo) PlatformStats(ctx context.Context) (Stats, error) {
	var s Stats
	err := r.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM users),
			(SELECT COUNT(*) FROM users WHERE role = 'admin'),
			(SELECT COUNT(*) FROM sites),
			(SELECT COUNT(*) FROM sites WHERE status = 'published'),
			(SELECT COUNT(*) FROM pages),
			(SELECT COUNT(*) FROM domains),
			(SELECT COUNT(*) FROM domains WHERE status = 'verified'),
			(SELECT COUNT(*) FROM assets),
			(SELECT COALESCE(SUM(size), 0) FROM assets)
	`).Scan(
		&s.UserCount, &s.AdminCount,
		&s.SiteCount, &s.PublishedSites,
		&s.PageCount,
		&s.DomainCount, &s.VerifiedDomains,
		&s.AssetCount, &s.TotalStorageBytes,
	)
	if err != nil {
		return s, err
	}
	return s, nil
}

// silence unused
var _ = pgx.ErrNoRows
