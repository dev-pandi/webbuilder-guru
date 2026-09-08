package learning

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

// Material — "Pembelajaran". Spec §19 & §23.
// Tidak ada views, tidak ada tanggapan.
type Material struct {
	ID             uuid.UUID       `json:"id"`
	SiteID         uuid.UUID       `json:"site_id"`
	Slug           string          `json:"slug"`
	Title          string          `json:"title"`
	Excerpt        string          `json:"excerpt"`
	BodyMD         string          `json:"body_md"`
	CoverImageURL  string          `json:"cover_image_url"`
	Tags           json.RawMessage `json:"tags"`
	Summary        string          `json:"summary"`
	Status         string          `json:"status"`
	SEOTitle       string          `json:"seo_title"`
	SEODescription string          `json:"seo_description"`
	PublishedAt    *time.Time      `json:"published_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound  = errors.New("learning material not found")
	ErrSlugTaken = errors.New("learning material slug already used")
)

const cols = `id, site_id, slug, title, excerpt, body_md, cover_image_url,
    tags_json, summary, status, seo_title, seo_description, published_at, created_at, updated_at`

func scan(m *Material) []any {
	return []any{
		&m.ID, &m.SiteID, &m.Slug, &m.Title, &m.Excerpt, &m.BodyMD, &m.CoverImageURL,
		&m.Tags, &m.Summary, &m.Status, &m.SEOTitle, &m.SEODescription,
		&m.PublishedAt, &m.CreatedAt, &m.UpdatedAt,
	}
}

func (r *Repo) CountBySite(ctx context.Context, siteID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM learning_materials WHERE site_id = $1`, siteID).Scan(&n)
	return n, err
}

type CreateInput struct {
	Slug           string
	Title          string
	Excerpt        string
	BodyMD         string
	CoverImageURL  string
	Tags           json.RawMessage
	Summary        string
	Status         string
	SEOTitle       string
	SEODescription string
}

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, in CreateInput) (*Material, error) {
	if in.Status == "" {
		in.Status = "draft"
	}
	if in.Status != "draft" && in.Status != "published" {
		return nil, errors.New("invalid status")
	}
	if len(in.Tags) == 0 {
		in.Tags = json.RawMessage(`[]`)
	}
	var publishedAt *time.Time
	if in.Status == "published" {
		t := time.Now()
		publishedAt = &t
	}
	var m Material
	err := r.pool.QueryRow(ctx, `
		INSERT INTO learning_materials (site_id, slug, title, excerpt, body_md, cover_image_url,
		    tags_json, summary, status, seo_title, seo_description, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING `+cols+`
	`, siteID, in.Slug, in.Title, in.Excerpt, in.BodyMD, in.CoverImageURL,
		in.Tags, in.Summary, in.Status, in.SEOTitle, in.SEODescription, publishedAt,
	).Scan(scan(&m)...)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

type UpdateInput struct {
	Slug           *string
	Title          *string
	Excerpt        *string
	BodyMD         *string
	CoverImageURL  *string
	Tags           json.RawMessage
	Summary        *string
	Status         *string
	SEOTitle       *string
	SEODescription *string
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Material, error) {
	if in.Status != nil && *in.Status != "draft" && *in.Status != "published" {
		return nil, errors.New("invalid status")
	}
	publishedAtExpr := "published_at"
	if in.Status != nil && *in.Status == "published" {
		publishedAtExpr = "COALESCE(published_at, now())"
	}
	q := fmt.Sprintf(`
		UPDATE learning_materials SET
		    slug            = COALESCE($2, slug),
		    title           = COALESCE($3, title),
		    excerpt         = COALESCE($4, excerpt),
		    body_md         = COALESCE($5, body_md),
		    cover_image_url = COALESCE($6, cover_image_url),
		    tags_json       = COALESCE($7, tags_json),
		    summary         = COALESCE($8, summary),
		    status          = COALESCE($9, status),
		    seo_title       = COALESCE($10, seo_title),
		    seo_description = COALESCE($11, seo_description),
		    published_at    = %s,
		    updated_at      = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, publishedAtExpr)
	var m Material
	err := r.pool.QueryRow(ctx, q, id, in.Slug, in.Title, in.Excerpt, in.BodyMD,
		in.CoverImageURL, jsonOrNil(in.Tags), in.Summary, in.Status,
		in.SEOTitle, in.SEODescription,
	).Scan(scan(&m)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	return &m, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Material, error) {
	var m Material
	err := r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM learning_materials WHERE id = $1`, id).Scan(scan(&m)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &m, err
}

func (r *Repo) GetBySiteSlug(ctx context.Context, siteID uuid.UUID, slug string) (*Material, error) {
	var m Material
	err := r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM learning_materials WHERE site_id = $1 AND slug = $2`,
		siteID, slug,
	).Scan(scan(&m)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &m, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM learning_materials WHERE id = $1`, id)
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
		return "published_at DESC NULLS LAST, created_at DESC"
	case "oldest":
		return "created_at ASC"
	case "newest", "":
		return "created_at DESC"
	}
	return "created_at DESC"
}

func (r *Repo) ListPage(
	ctx context.Context, siteID uuid.UUID, like, statusFilter, sort string, limit, offset int,
) ([]Material, int, error) {
	statusClause := ""
	args := []any{siteID, like}
	if statusFilter != "" {
		statusClause = " AND status = $3"
		args = append(args, statusFilter)
	}
	var total int
	countArgs := append([]any{}, args...)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM learning_materials WHERE site_id = $1
		 AND (LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2)`+statusClause,
		countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	q := fmt.Sprintf(`
		SELECT `+cols+`
		FROM learning_materials
		WHERE site_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2)%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, statusClause, orderSQL(sort), len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Material{}
	for rows.Next() {
		var m Material
		if err := rows.Scan(scan(&m)...); err != nil {
			return nil, 0, err
		}
		out = append(out, m)
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
