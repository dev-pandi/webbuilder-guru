package blog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Post struct {
	ID            uuid.UUID       `json:"id"`
	SiteID        uuid.UUID       `json:"site_id"`
	Slug          string          `json:"slug"`
	Title         string          `json:"title"`
	Excerpt       string          `json:"excerpt"`
	ContentMD     string          `json:"content_md"`
	CoverImageURL string          `json:"cover_image_url"`
	AuthorName    string          `json:"author_name"`
	Tags          json.RawMessage `json:"tags"`
	Status        string          `json:"status"` // draft | published
	PublishedAt   *time.Time      `json:"published_at,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound  = errors.New("blog post not found")
	ErrSlugTaken = errors.New("blog post slug already used in this site")
)

const cols = `id, site_id, slug, title, excerpt, content_md, cover_image_url, author_name,
    tags_json, status, published_at, created_at, updated_at`

func scan(p *Post) []any {
	return []any{
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Excerpt, &p.ContentMD, &p.CoverImageURL, &p.AuthorName,
		&p.Tags, &p.Status, &p.PublishedAt, &p.CreatedAt, &p.UpdatedAt,
	}
}

func (r *Repo) CountBySite(ctx context.Context, siteID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM blog_posts WHERE site_id = $1`, siteID).Scan(&n)
	return n, err
}

type CreateInput struct {
	Slug          string
	Title         string
	Excerpt       string
	ContentMD     string
	CoverImageURL string
	AuthorName    string
	Tags          json.RawMessage
	Status        string
}

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, in CreateInput) (*Post, error) {
	if in.Status == "" {
		in.Status = "draft"
	}
	if len(in.Tags) == 0 {
		in.Tags = json.RawMessage(`[]`)
	}
	var publishedAt *time.Time
	if in.Status == "published" {
		t := time.Now()
		publishedAt = &t
	}
	var p Post
	err := r.pool.QueryRow(ctx, `
		INSERT INTO blog_posts (site_id, slug, title, excerpt, content_md, cover_image_url, author_name,
		    tags_json, status, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING `+cols+`
	`, siteID, in.Slug, in.Title, in.Excerpt, in.ContentMD, in.CoverImageURL, in.AuthorName,
		in.Tags, in.Status, publishedAt,
	).Scan(scan(&p)...)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

type UpdateInput struct {
	Slug          *string
	Title         *string
	Excerpt       *string
	ContentMD     *string
	CoverImageURL *string
	AuthorName    *string
	Tags          json.RawMessage
	Status        *string
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Post, error) {
	// If status transitions to "published" and published_at is NULL, set it to now.
	// Otherwise leave existing published_at as-is.
	publishedAtExpr := "published_at"
	if in.Status != nil && *in.Status == "published" {
		publishedAtExpr = "COALESCE(published_at, now())"
	} else if in.Status != nil && *in.Status == "draft" {
		// unpublish: keep timestamp historically (so toggling on/off doesn't lose it)
	}

	q := fmt.Sprintf(`
		UPDATE blog_posts SET
		    slug            = COALESCE($2, slug),
		    title           = COALESCE($3, title),
		    excerpt         = COALESCE($4, excerpt),
		    content_md      = COALESCE($5, content_md),
		    cover_image_url = COALESCE($6, cover_image_url),
		    author_name     = COALESCE($7, author_name),
		    tags_json       = COALESCE($8, tags_json),
		    status          = COALESCE($9, status),
		    published_at    = %s,
		    updated_at      = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, publishedAtExpr)

	var p Post
	err := r.pool.QueryRow(ctx, q, id, in.Slug, in.Title, in.Excerpt, in.ContentMD,
		in.CoverImageURL, in.AuthorName, jsonOrNil(in.Tags), in.Status,
	).Scan(scan(&p)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	return &p, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Post, error) {
	var p Post
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM blog_posts WHERE id = $1`, id).Scan(scan(&p)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) GetBySiteSlug(ctx context.Context, siteID uuid.UUID, slug string) (*Post, error) {
	var p Post
	err := r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM blog_posts WHERE site_id = $1 AND slug = $2`,
		siteID, slug,
	).Scan(scan(&p)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM blog_posts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func orderSQL(sort string) string {
	switch sort {
	case "title_asc":
		return "title ASC"
	case "title_desc":
		return "title DESC"
	case "published_desc":
		// nulls last so drafts sit at the bottom when sorted by published date
		return "published_at DESC NULLS LAST, created_at DESC"
	case "oldest":
		return "created_at ASC"
	case "newest", "":
		return "created_at DESC"
	}
	return "created_at DESC"
}

// ListPage returns one page of posts.
// `statusFilter` is one of "draft" | "published" | "" (all).
func (r *Repo) ListPage(ctx context.Context, siteID uuid.UUID, like, statusFilter, sort string, limit, offset int) ([]Post, int, error) {
	statusClause := ""
	args := []any{siteID, like}
	if statusFilter != "" {
		statusClause = " AND status = $3"
		args = append(args, statusFilter)
	}

	var total int
	countArgs := append([]any{}, args...)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM blog_posts WHERE site_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2)`+statusClause,
		countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	limitClause := fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	q := fmt.Sprintf(`
		SELECT `+cols+`
		FROM blog_posts
		WHERE site_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2)%s
		ORDER BY %s%s
	`, statusClause, orderSQL(sort), limitClause)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Post{}
	for rows.Next() {
		var p Post
		if err := rows.Scan(scan(&p)...); err != nil {
			return nil, 0, err
		}
		out = append(out, p)
	}
	return out, total, rows.Err()
}

func jsonOrNil(v json.RawMessage) any {
	if len(v) == 0 {
		return nil
	}
	return v
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
