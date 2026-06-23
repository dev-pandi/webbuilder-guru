package pages

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Page struct {
	ID        uuid.UUID       `json:"id"`
	SiteID    uuid.UUID       `json:"site_id"`
	Slug      string          `json:"slug"`
	Title     string          `json:"title"`
	Tree      json.RawMessage `json:"tree"`
	SEO       json.RawMessage `json:"seo"`
	IsHome    bool            `json:"is_home"`
	Version   int             `json:"version"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")
var ErrSlugTaken = errors.New("slug taken")

func (r *Repo) CountBySite(ctx context.Context, siteID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM pages WHERE site_id = $1`, siteID).Scan(&n)
	return n, err
}

func (r *Repo) ListBySite(ctx context.Context, siteID uuid.UUID) ([]Page, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at
		FROM pages WHERE site_id = $1
		ORDER BY is_home DESC, slug ASC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Page{}
	for rows.Next() {
		var p Page
		if err := rows.Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at
		FROM pages WHERE id = $1
	`, id).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) GetBySiteAndSlug(ctx context.Context, siteID uuid.UUID, slug string) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at
		FROM pages WHERE site_id = $1 AND slug = $2
	`, siteID, slug).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) GetHomeOfSite(ctx context.Context, siteID uuid.UUID) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at
		FROM pages WHERE site_id = $1 AND is_home = true LIMIT 1
	`, siteID).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, slug, title string, tree, seo json.RawMessage, isHome bool) (*Page, error) {
	if tree == nil {
		tree = json.RawMessage(`{}`)
	}
	if seo == nil {
		seo = json.RawMessage(`{}`)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if isHome {
		if _, err := tx.Exec(ctx, `UPDATE pages SET is_home = false WHERE site_id = $1`, siteID); err != nil {
			return nil, err
		}
	}
	var p Page
	err = tx.QueryRow(ctx, `
		INSERT INTO pages (site_id, slug, title, tree_json, seo_json, is_home)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at
	`, siteID, slug, title, tree, seo, isHome).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt,
	)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, title *string, tree, seo json.RawMessage, isHome *bool, slug *string) (*Page, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if isHome != nil && *isHome {
		var siteID uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT site_id FROM pages WHERE id = $1`, id).Scan(&siteID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if _, err := tx.Exec(ctx, `UPDATE pages SET is_home = false WHERE site_id = $1`, siteID); err != nil {
			return nil, err
		}
	}

	var p Page
	err = tx.QueryRow(ctx, `
		UPDATE pages SET
			title      = COALESCE($2, title),
			tree_json  = COALESCE($3, tree_json),
			seo_json   = COALESCE($4, seo_json),
			is_home    = COALESCE($5, is_home),
			slug       = COALESCE($6, slug),
			version    = version + 1,
			updated_at = now()
		WHERE id = $1
		RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at
	`, id, title, tree, seo, isHome, slug).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM pages WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Duplicate clones a page (new id, "<slug>-copy", same tree+seo, is_home=false).
// If the candidate slug is taken, "-copy-2", "-copy-3", ... are tried.
func (r *Repo) Duplicate(ctx context.Context, id uuid.UUID) (*Page, error) {
	src, err := r.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	base := src.Slug + "-copy"
	candidate := base
	for i := 2; i < 100; i++ {
		_, err := r.GetBySiteAndSlug(ctx, src.SiteID, candidate)
		if errors.Is(err, ErrNotFound) {
			break
		}
		if err != nil {
			return nil, err
		}
		candidate = base + "-" + strconv.Itoa(i)
	}
	newTitle := src.Title
	if newTitle != "" {
		newTitle = newTitle + " (Salinan)"
	}
	return r.Create(ctx, src.SiteID, candidate, newTitle, src.Tree, src.SEO, false)
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
