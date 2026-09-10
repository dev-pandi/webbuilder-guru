// Package platform_articles — CRUD untuk artikel platform-level (marketing
// homepage blog / knowledge base). Berbeda dari `articles` per-site.
package platform_articles

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

type Article struct {
	ID              uuid.UUID       `json:"id"`
	Slug            string          `json:"slug"`
	Title           string          `json:"title"`
	Excerpt         string          `json:"excerpt"`
	BodyMD          string          `json:"body_md"`
	CoverImageURL   string          `json:"cover_image_url"`
	Category        string          `json:"category"`
	AuthorName      string          `json:"author_name"`
	Tags            json.RawMessage `json:"tags"`
	Status          string          `json:"status"`
	Featured        bool            `json:"featured"`
	ReadingTimeMin  int             `json:"reading_time_min"`
	ViewCount       int64           `json:"view_count"`
	SEOTitle        string          `json:"seo_title"`
	SEODescription  string          `json:"seo_description"`
	PublishedAt     *time.Time      `json:"published_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Kategori pre-defined — tidak enforce di DB (TEXT), tapi UI expose ini.
var ValidCategories = []string{
	"umum", "tutorial", "cerita", "tips", "panduan", "pengumuman",
}

func IsValidCategory(c string) bool {
	for _, v := range ValidCategories {
		if v == c {
			return true
		}
	}
	return false
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound  = errors.New("platform article not found")
	ErrSlugTaken = errors.New("slug already used")
)

const cols = `id, slug, title, excerpt, body_md, cover_image_url, category,
    author_name, tags_json, status, featured, reading_time_min, view_count,
    seo_title, seo_description, published_at, created_at, updated_at`

func scan(a *Article) []any {
	return []any{
		&a.ID, &a.Slug, &a.Title, &a.Excerpt, &a.BodyMD, &a.CoverImageURL, &a.Category,
		&a.AuthorName, &a.Tags, &a.Status, &a.Featured, &a.ReadingTimeMin, &a.ViewCount,
		&a.SEOTitle, &a.SEODescription, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
	}
}

type CreateInput struct {
	Slug            string
	Title           string
	Excerpt         string
	BodyMD          string
	CoverImageURL   string
	Category        string
	AuthorName      string
	Tags            json.RawMessage
	Status          string
	Featured        bool
	ReadingTimeMin  int
	SEOTitle        string
	SEODescription  string
}

func (r *Repo) Create(ctx context.Context, in CreateInput) (*Article, error) {
	if in.Status == "" {
		in.Status = "draft"
	}
	if in.Category == "" {
		in.Category = "umum"
	}
	if in.AuthorName == "" {
		in.AuthorName = "Tim Web Builder"
	}
	if len(in.Tags) == 0 {
		in.Tags = json.RawMessage(`[]`)
	}
	var publishedAt *time.Time
	if in.Status == "published" {
		t := time.Now()
		publishedAt = &t
	}
	var a Article
	err := r.pool.QueryRow(ctx, `
		INSERT INTO platform_articles (slug, title, excerpt, body_md, cover_image_url,
		    category, author_name, tags_json, status, featured, reading_time_min,
		    seo_title, seo_description, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		RETURNING `+cols+`
	`, in.Slug, in.Title, in.Excerpt, in.BodyMD, in.CoverImageURL,
		in.Category, in.AuthorName, in.Tags, in.Status, in.Featured, in.ReadingTimeMin,
		in.SEOTitle, in.SEODescription, publishedAt,
	).Scan(scan(&a)...)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

type UpdateInput struct {
	Slug            *string
	Title           *string
	Excerpt         *string
	BodyMD          *string
	CoverImageURL   *string
	Category        *string
	AuthorName      *string
	Tags            json.RawMessage
	Status          *string
	Featured        *bool
	ReadingTimeMin  *int
	SEOTitle        *string
	SEODescription  *string
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Article, error) {
	publishedAtExpr := "published_at"
	if in.Status != nil && *in.Status == "published" {
		publishedAtExpr = "COALESCE(published_at, now())"
	}
	q := fmt.Sprintf(`
		UPDATE platform_articles SET
		    slug             = COALESCE($2, slug),
		    title            = COALESCE($3, title),
		    excerpt          = COALESCE($4, excerpt),
		    body_md          = COALESCE($5, body_md),
		    cover_image_url  = COALESCE($6, cover_image_url),
		    category         = COALESCE($7, category),
		    author_name      = COALESCE($8, author_name),
		    tags_json        = COALESCE($9, tags_json),
		    status           = COALESCE($10, status),
		    featured         = COALESCE($11, featured),
		    reading_time_min = COALESCE($12, reading_time_min),
		    seo_title        = COALESCE($13, seo_title),
		    seo_description  = COALESCE($14, seo_description),
		    published_at     = %s,
		    updated_at       = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, publishedAtExpr)
	var a Article
	err := r.pool.QueryRow(ctx, q, id, in.Slug, in.Title, in.Excerpt, in.BodyMD,
		in.CoverImageURL, in.Category, in.AuthorName, jsonOrNil(in.Tags),
		in.Status, in.Featured, in.ReadingTimeMin, in.SEOTitle, in.SEODescription,
	).Scan(scan(&a)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	return &a, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Article, error) {
	var a Article
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM platform_articles WHERE id = $1`, id).Scan(scan(&a)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

func (r *Repo) GetBySlug(ctx context.Context, slug string) (*Article, error) {
	var a Article
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM platform_articles WHERE slug = $1`, slug).Scan(scan(&a)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM platform_articles WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) IncrementView(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE platform_articles SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
}

func orderSQL(sort string) string {
	switch sort {
	case "title_asc":
		return "title ASC"
	case "views_desc":
		return "view_count DESC, published_at DESC NULLS LAST"
	case "published_desc", "":
		return "featured DESC, published_at DESC NULLS LAST, created_at DESC"
	case "oldest":
		return "created_at ASC"
	case "newest":
		return "created_at DESC"
	}
	return "featured DESC, published_at DESC NULLS LAST, created_at DESC"
}

// ListPage — dashboard admin (semua status).
func (r *Repo) ListPage(
	ctx context.Context, like, categoryFilter, statusFilter, sort string, limit, offset int,
) ([]Article, int, error) {
	extra := ""
	args := []any{like}
	if categoryFilter != "" {
		args = append(args, categoryFilter)
		extra += fmt.Sprintf(" AND category = $%d", len(args))
	}
	if statusFilter != "" {
		args = append(args, statusFilter)
		extra += fmt.Sprintf(" AND status = $%d", len(args))
	}
	var total int
	countArgs := append([]any{}, args...)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM platform_articles
		 WHERE (LOWER(title) LIKE $1 OR LOWER(slug) LIKE $1)`+extra,
		countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	q := fmt.Sprintf(`
		SELECT `+cols+`
		FROM platform_articles
		WHERE (LOWER(title) LIKE $1 OR LOWER(slug) LIKE $1)%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, extra, orderSQL(sort), len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Article{}
	for rows.Next() {
		var a Article
		if err := rows.Scan(scan(&a)...); err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

// ListPublic — hanya published, sort default featured + published_desc.
func (r *Repo) ListPublic(ctx context.Context, category string, limit int) ([]Article, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	args := []any{limit}
	extra := ""
	if category != "" {
		args = append(args, category)
		extra = " AND category = $2"
	}
	q := `
		SELECT ` + cols + `
		FROM platform_articles
		WHERE status = 'published'` + extra + `
		ORDER BY featured DESC, published_at DESC NULLS LAST, created_at DESC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Article{}
	for rows.Next() {
		var a Article
		if err := rows.Scan(scan(&a)...); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// CountPublic — untuk cek apakah seed diperlukan (idempotent).
func (r *Repo) CountPublic(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM platform_articles`).Scan(&n)
	return n, err
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
