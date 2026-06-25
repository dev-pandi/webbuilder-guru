package sites

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const MaxSitesPerUser = 5

type Site struct {
	ID                   uuid.UUID       `json:"id"`
	UserID               uuid.UUID       `json:"user_id"`
	Slug                 string          `json:"slug"`
	Name                 string          `json:"name"`
	TemplateID           *uuid.UUID      `json:"template_id,omitempty"`
	Theme                json.RawMessage `json:"theme"`
	Status               string          `json:"status"`
	QuotaMaxPages        int             `json:"quota_max_pages"`
	QuotaMaxStorageBytes int64           `json:"quota_max_storage_bytes"`
	QuotaMaxProducts     int             `json:"quota_max_products"`
	QuotaMaxBlogPosts    int             `json:"quota_max_blog_posts"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// siteCols is the SELECT column list, kept in sync with scanArgs.
const siteCols = `id, user_id, slug, name, template_id, theme_json, status,
    quota_max_pages, quota_max_storage_bytes, quota_max_products, quota_max_blog_posts,
    created_at, updated_at`

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")
var ErrSlugTaken = errors.New("slug taken")
var ErrLimitReached = errors.New("site limit reached")

func (r *Repo) CountByUser(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM sites WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

func (r *Repo) Create(ctx context.Context, userID uuid.UUID, slug, name string, templateID *uuid.UUID, theme json.RawMessage) (*Site, error) {
	n, err := r.CountByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if n >= MaxSitesPerUser {
		return nil, ErrLimitReached
	}
	if theme == nil {
		theme = json.RawMessage(`{}`)
	}
	var s Site
	err = r.pool.QueryRow(ctx, `
		INSERT INTO sites (user_id, slug, name, template_id, theme_json)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+siteCols+`
	`, userID, slug, name, templateID, theme).Scan(scanArgs(&s)...)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// scanArgs returns the pointer list matching siteCols, in order.
func scanArgs(s *Site) []any {
	return []any{
		&s.ID, &s.UserID, &s.Slug, &s.Name, &s.TemplateID, &s.Theme, &s.Status,
		&s.QuotaMaxPages, &s.QuotaMaxStorageBytes, &s.QuotaMaxProducts, &s.QuotaMaxBlogPosts,
		&s.CreatedAt, &s.UpdatedAt,
	}
}

func (r *Repo) ListByUser(ctx context.Context, userID uuid.UUID) ([]Site, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+siteCols+`
		FROM sites WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Site{}
	for rows.Next() {
		var s Site
		if err := rows.Scan(scanArgs(&s)...); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repo) GetOwned(ctx context.Context, id, userID uuid.UUID) (*Site, error) {
	var s Site
	err := r.pool.QueryRow(ctx, `
		SELECT `+siteCols+`
		FROM sites WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(scanArgs(&s)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

// GetByID fetches a site without owner scoping. ONLY call this from contexts
// that already validated capability via another mechanism (e.g. preview HMAC
// token). Avoid using it in user-facing endpoints — prefer GetOwned.
func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Site, error) {
	var s Site
	err := r.pool.QueryRow(ctx, `
		SELECT `+siteCols+`
		FROM sites WHERE id = $1
	`, id).Scan(scanArgs(&s)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

func (r *Repo) Update(ctx context.Context, id, userID uuid.UUID, name *string, theme json.RawMessage, status *string) (*Site, error) {
	var s Site
	err := r.pool.QueryRow(ctx, `
		UPDATE sites SET
			name       = COALESCE($3, name),
			theme_json = COALESCE($4, theme_json),
			status     = COALESCE($5, status),
			updated_at = now()
		WHERE id = $1 AND user_id = $2
		RETURNING `+siteCols+`
	`, id, userID, name, theme, status).Scan(scanArgs(&s)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

func (r *Repo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM sites WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetByHost looks up a published site by associated domain hostname.
func (r *Repo) GetByHost(ctx context.Context, host string) (*Site, error) {
	var s Site
	err := r.pool.QueryRow(ctx, `
		SELECT `+sitePrefixedCols("s")+`
		FROM sites s
		JOIN domains d ON d.site_id = s.id
		WHERE d.hostname = $1 AND d.status = 'verified' AND s.status = 'published'
		LIMIT 1
	`, host).Scan(scanArgs(&s)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

// GetBySlug returns a published site by its platform slug (e.g. <slug>.example.id).
func (r *Repo) GetBySlug(ctx context.Context, slug string) (*Site, error) {
	var s Site
	err := r.pool.QueryRow(ctx, `
		SELECT `+siteCols+`
		FROM sites WHERE slug = $1 AND status = 'published'
	`, slug).Scan(scanArgs(&s)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

// sitePrefixedCols returns siteCols with a table alias for JOIN queries.
func sitePrefixedCols(alias string) string {
	cols := []string{
		"id", "user_id", "slug", "name", "template_id", "theme_json", "status",
		"quota_max_pages", "quota_max_storage_bytes", "quota_max_products", "quota_max_blog_posts",
		"created_at", "updated_at",
	}
	out := ""
	for i, c := range cols {
		if i > 0 {
			out += ", "
		}
		out += alias + "." + c
	}
	return out
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
