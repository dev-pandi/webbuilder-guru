package admin

import (
	"context"
	"errors"
	"fmt"
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

// orderUsersSQL whitelists sort presets to safe ORDER BY fragments.
func orderUsersSQL(sort string) string {
	switch sort {
	case "email_asc":
		return "u.email ASC"
	case "email_desc":
		return "u.email DESC"
	case "sites_desc":
		return "site_count DESC, u.created_at DESC"
	case "oldest":
		return "u.created_at ASC"
	case "newest", "":
		return "u.created_at DESC"
	}
	return "u.created_at DESC"
}

// ListUsersPage returns one paginated page of users, with site counts and
// an ILIKE filter over email/name. Total reflects the filtered count.
func (r *Repo) ListUsersPage(ctx context.Context, like, sort string, limit, offset int) ([]UserRow, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM users u
		WHERE LOWER(u.email) LIKE $1 OR LOWER(u.name) LIKE $1
	`, like).Scan(&total); err != nil {
		return nil, 0, err
	}

	q := fmt.Sprintf(`
		SELECT u.id, u.email, u.name, u.role, u.created_at,
		       COUNT(s.id) AS site_count
		FROM users u
		LEFT JOIN sites s ON s.user_id = u.id
		WHERE LOWER(u.email) LIKE $1 OR LOWER(u.name) LIKE $1
		GROUP BY u.id
		ORDER BY %s
		LIMIT $2 OFFSET $3
	`, orderUsersSQL(sort))

	rows, err := r.pool.Query(ctx, q, like, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &u.SiteCount); err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
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
	ProductsCount        int       `json:"products_count"`
	BlogPostsCount       int       `json:"blog_posts_count"`
	QuotaMaxPages        int       `json:"quota_max_pages"`
	QuotaMaxStorageBytes int64     `json:"quota_max_storage_bytes"`
	QuotaMaxProducts     int       `json:"quota_max_products"`
	QuotaMaxBlogPosts    int       `json:"quota_max_blog_posts"`
	CreatedAt            time.Time `json:"created_at"`
}

func orderSitesSQL(sort string) string {
	switch sort {
	case "storage_desc":
		return "storage_bytes DESC, s.created_at DESC"
	case "pages_desc":
		return "pages_count DESC, s.created_at DESC"
	case "name_asc":
		return "s.name ASC"
	case "oldest":
		return "s.created_at ASC"
	case "newest", "":
		return "s.created_at DESC"
	}
	return "s.created_at DESC"
}

// ListSitesPage filters by name/slug/owner email and supports presets sort.
func (r *Repo) ListSitesPage(ctx context.Context, like, sort string, limit, offset int) ([]SiteRow, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM sites s
		JOIN users u ON u.id = s.user_id
		WHERE LOWER(s.name) LIKE $1
		   OR LOWER(s.slug) LIKE $1
		   OR LOWER(u.email) LIKE $1
	`, like).Scan(&total); err != nil {
		return nil, 0, err
	}

	q := fmt.Sprintf(`
		SELECT s.id, s.slug, s.name, s.status,
		       s.user_id, u.email,
		       COALESCE(p.cnt, 0)   AS pages_count,
		       COALESCE(a.cnt, 0)   AS assets_count,
		       COALESCE(a.bytes, 0) AS storage_bytes,
		       COALESCE(pr.cnt, 0)  AS products_count,
		       COALESCE(bp.cnt, 0)  AS blog_posts_count,
		       s.quota_max_pages, s.quota_max_storage_bytes,
		       s.quota_max_products, s.quota_max_blog_posts,
		       s.created_at
		FROM sites s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN (SELECT site_id, COUNT(*) AS cnt FROM pages GROUP BY site_id) p ON p.site_id = s.id
		LEFT JOIN (SELECT site_id, COUNT(*) AS cnt, COALESCE(SUM(size), 0) AS bytes FROM assets GROUP BY site_id) a ON a.site_id = s.id
		LEFT JOIN (SELECT site_id, COUNT(*) AS cnt FROM products GROUP BY site_id) pr ON pr.site_id = s.id
		LEFT JOIN (SELECT site_id, COUNT(*) AS cnt FROM blog_posts GROUP BY site_id) bp ON bp.site_id = s.id
		WHERE LOWER(s.name) LIKE $1
		   OR LOWER(s.slug) LIKE $1
		   OR LOWER(u.email) LIKE $1
		ORDER BY %s
		LIMIT $2 OFFSET $3
	`, orderSitesSQL(sort))

	rows, err := r.pool.Query(ctx, q, like, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []SiteRow{}
	for rows.Next() {
		var s SiteRow
		if err := rows.Scan(
			&s.ID, &s.Slug, &s.Name, &s.Status,
			&s.OwnerID, &s.OwnerEmail,
			&s.PagesCount, &s.AssetsCount, &s.StorageBytes,
			&s.ProductsCount, &s.BlogPostsCount,
			&s.QuotaMaxPages, &s.QuotaMaxStorageBytes,
			&s.QuotaMaxProducts, &s.QuotaMaxBlogPosts,
			&s.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

func (r *Repo) UpdateSiteQuota(ctx context.Context, id uuid.UUID, maxPages *int, maxStorageBytes *int64, maxProducts, maxBlogPosts *int) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE sites SET
		    quota_max_pages         = COALESCE($2, quota_max_pages),
		    quota_max_storage_bytes = COALESCE($3, quota_max_storage_bytes),
		    quota_max_products      = COALESCE($4, quota_max_products),
		    quota_max_blog_posts    = COALESCE($5, quota_max_blog_posts),
		    updated_at              = now()
		WHERE id = $1
	`, id, maxPages, maxStorageBytes, maxProducts, maxBlogPosts)
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
