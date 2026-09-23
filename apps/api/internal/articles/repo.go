package articles

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

// Article represents one entry in one of the 6 rubrik (ceritaku/bacaanku/
// inspirasiku/bangsaku/peradaban/forum-diskusi). See spec §22.
type Article struct {
	ID              uuid.UUID       `json:"id"`
	SiteID          uuid.UUID       `json:"site_id"`
	Rubric          string          `json:"rubric"`
	Slug            string          `json:"slug"`
	Title           string          `json:"title"`
	Excerpt         string          `json:"excerpt"`
	BodyMD          string          `json:"body_md"`
	CoverImageURL   string          `json:"cover_image_url"`
	Tags            json.RawMessage `json:"tags"`
	Status          string          `json:"status"`
	CommentsEnabled bool            `json:"comments_enabled"`
	ReadingTimeMin  int             `json:"reading_time_min"`
	ViewCount       int64           `json:"view_count"`
	SEOTitle        string          `json:"seo_title"`
	SEODescription  string          `json:"seo_description"`
	PublishedAt     *time.Time      `json:"published_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound    = errors.New("article not found")
	ErrSlugTaken   = errors.New("article slug already used in this rubric")
	ErrInvalidRub  = errors.New("invalid rubric")
	ErrInvalidStat = errors.New("invalid status")
)

// ValidRubrics — order matches spec navigation.
var ValidRubrics = []string{
	"ceritaku", "bacaanku", "inspirasiku", "bangsaku", "peradaban", "forum-diskusi",
}

func IsValidRubric(r string) bool {
	for _, v := range ValidRubrics {
		if v == r {
			return true
		}
	}
	return false
}

// IsForumRubric — forum has fixed rule: comments_enabled must be true.
func IsForumRubric(r string) bool { return r == "forum-diskusi" }

const cols = `id, site_id, rubric, slug, title, excerpt, body_md, cover_image_url,
    tags_json, status, comments_enabled, reading_time_min, view_count,
    seo_title, seo_description, published_at, created_at, updated_at`

func scan(a *Article) []any {
	return []any{
		&a.ID, &a.SiteID, &a.Rubric, &a.Slug, &a.Title, &a.Excerpt, &a.BodyMD, &a.CoverImageURL,
		&a.Tags, &a.Status, &a.CommentsEnabled, &a.ReadingTimeMin, &a.ViewCount,
		&a.SEOTitle, &a.SEODescription, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
	}
}

func (r *Repo) CountBySite(ctx context.Context, siteID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM articles WHERE site_id = $1`, siteID).Scan(&n)
	return n, err
}

type CreateInput struct {
	Rubric          string
	Slug            string
	Title           string
	Excerpt         string
	BodyMD          string
	CoverImageURL   string
	Tags            json.RawMessage
	Status          string
	CommentsEnabled bool
	ReadingTimeMin  int
	SEOTitle        string
	SEODescription  string
}

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, in CreateInput) (*Article, error) {
	if !IsValidRubric(in.Rubric) {
		return nil, ErrInvalidRub
	}
	if in.Status == "" {
		in.Status = "draft"
	}
	if in.Status != "draft" && in.Status != "published" {
		return nil, ErrInvalidStat
	}
	if len(in.Tags) == 0 {
		in.Tags = json.RawMessage(`[]`)
	}
	// Forum enforce: spec §16 — comments always ON for forum-diskusi.
	if IsForumRubric(in.Rubric) {
		in.CommentsEnabled = true
	}
	var publishedAt *time.Time
	if in.Status == "published" {
		t := time.Now()
		publishedAt = &t
	}
	var a Article
	err := r.pool.QueryRow(ctx, `
		INSERT INTO articles (site_id, rubric, slug, title, excerpt, body_md, cover_image_url,
		    tags_json, status, comments_enabled, reading_time_min, seo_title, seo_description, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		RETURNING `+cols+`
	`, siteID, in.Rubric, in.Slug, in.Title, in.Excerpt, in.BodyMD, in.CoverImageURL,
		in.Tags, in.Status, in.CommentsEnabled, in.ReadingTimeMin, in.SEOTitle, in.SEODescription, publishedAt,
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
	Tags            json.RawMessage
	Status          *string
	CommentsEnabled *bool
	ReadingTimeMin  *int
	SEOTitle        *string
	SEODescription  *string
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Article, error) {
	if in.Status != nil && *in.Status != "draft" && *in.Status != "published" {
		return nil, ErrInvalidStat
	}
	// Transition ke published untuk pertama kali → set published_at now.
	publishedAtExpr := "published_at"
	if in.Status != nil && *in.Status == "published" {
		publishedAtExpr = "COALESCE(published_at, now())"
	}
	q := fmt.Sprintf(`
		UPDATE articles SET
		    slug             = COALESCE($2, slug),
		    title            = COALESCE($3, title),
		    excerpt          = COALESCE($4, excerpt),
		    body_md          = COALESCE($5, body_md),
		    cover_image_url  = COALESCE($6, cover_image_url),
		    tags_json        = COALESCE($7, tags_json),
		    status           = COALESCE($8, status),
		    comments_enabled = COALESCE($9, comments_enabled),
		    reading_time_min = COALESCE($10, reading_time_min),
		    seo_title        = COALESCE($11, seo_title),
		    seo_description  = COALESCE($12, seo_description),
		    published_at     = %s,
		    updated_at       = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, publishedAtExpr)
	var a Article
	err := r.pool.QueryRow(ctx, q, id, in.Slug, in.Title, in.Excerpt, in.BodyMD,
		in.CoverImageURL, jsonOrNil(in.Tags), in.Status, in.CommentsEnabled,
		in.ReadingTimeMin, in.SEOTitle, in.SEODescription,
	).Scan(scan(&a)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	// Forum enforce di update juga (kalau caller salah kirim false).
	if IsForumRubric(a.Rubric) && !a.CommentsEnabled {
		trueVal := true
		if _, err := r.pool.Exec(ctx,
			`UPDATE articles SET comments_enabled = true, updated_at = now() WHERE id = $1`, id); err != nil {
			return &a, err
		}
		a.CommentsEnabled = trueVal
	}
	return &a, nil
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Article, error) {
	var a Article
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM articles WHERE id = $1`, id).Scan(scan(&a)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

// GetBySiteRubricSlug — dipakai public renderer. JOIN sites filter
// status='published' supaya kalau site di-unpublish, article tidak lagi
// accessible (defense in depth on top of handler-level check). Cols di-scope
// via subquery ke articles supaya SELECT list tetap unqualified (reuse `cols`).
func (r *Repo) GetBySiteRubricSlug(ctx context.Context, siteID uuid.UUID, rubric, slug string) (*Article, error) {
	var a Article
	err := r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM articles
		 WHERE site_id = $1 AND rubric = $2 AND slug = $3
		   AND EXISTS (SELECT 1 FROM sites WHERE id = $1 AND status = 'published')`,
		siteID, rubric, slug,
	).Scan(scan(&a)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM articles WHERE id = $1`, id)
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
	case "views_desc":
		return "view_count DESC, published_at DESC NULLS LAST"
	case "published_desc":
		return "published_at DESC NULLS LAST, created_at DESC"
	case "oldest":
		return "created_at ASC"
	case "newest", "":
		return "created_at DESC"
	}
	return "created_at DESC"
}

// ListPage lists articles in a site, optionally filtered by rubric/status.
// rubricFilter "" = all, statusFilter "" = all.
func (r *Repo) ListPage(
	ctx context.Context,
	siteID uuid.UUID,
	like, rubricFilter, statusFilter, sort string,
	limit, offset int,
) ([]Article, int, error) {
	args := []any{siteID, like}
	extra := ""
	if rubricFilter != "" {
		args = append(args, rubricFilter)
		extra += fmt.Sprintf(" AND rubric = $%d", len(args))
	}
	if statusFilter != "" {
		args = append(args, statusFilter)
		extra += fmt.Sprintf(" AND status = $%d", len(args))
	}
	var total int
	countArgs := append([]any{}, args...)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM articles WHERE site_id = $1
		 AND (LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2)`+extra,
		countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	q := fmt.Sprintf(`
		SELECT `+cols+`
		FROM articles
		WHERE site_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2)%s
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

// SiteStats — for "Jejak Website Saya" block. Only published articles + approved
// responses count. Learning materials excluded per spec §12.
type SiteStats struct {
	TotalViews     int64 `json:"total_views"`
	TotalResponses int64 `json:"total_responses"` // approved only
	TotalArticles  int64 `json:"total_articles"`  // published only, includes forum
}

func (r *Repo) SiteStats(ctx context.Context, siteID uuid.UUID) (SiteStats, error) {
	var s SiteStats
	err := r.pool.QueryRow(ctx, `
		SELECT
		    COALESCE(SUM(view_count), 0),
		    (SELECT COUNT(*) FROM responses WHERE site_id = $1 AND status = 'approved'),
		    COUNT(*) FILTER (WHERE status = 'published')
		FROM articles
		WHERE site_id = $1
	`, siteID).Scan(&s.TotalViews, &s.TotalResponses, &s.TotalArticles)
	return s, err
}

// IncrementView adds one view with basic fingerprint dedupe (same fingerprint
// within lookbackMinutes → treated as duplicate, no counter bump).
// Returns (incremented, error).
func (r *Repo) IncrementView(ctx context.Context, articleID, siteID uuid.UUID, fingerprint string, lookbackMinutes int) (bool, error) {
	if lookbackMinutes <= 0 {
		lookbackMinutes = 60
	}
	if fingerprint != "" {
		var exists bool
		err := r.pool.QueryRow(ctx, `
			SELECT EXISTS (
			    SELECT 1 FROM article_view_events
			    WHERE article_id = $1 AND fingerprint = $2
			    AND created_at > now() - ($3 || ' minutes')::interval
			)
		`, articleID, fingerprint, fmt.Sprintf("%d", lookbackMinutes)).Scan(&exists)
		if err != nil {
			return false, err
		}
		if exists {
			return false, nil
		}
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`INSERT INTO article_view_events (article_id, site_id, fingerprint) VALUES ($1,$2,$3)`,
		articleID, siteID, fingerprint,
	); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE articles SET view_count = view_count + 1 WHERE id = $1`, articleID,
	); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// LatestPublished returns the N most-recently published articles across all
// rubrics (for Beranda "Tulisan Terbaru" block).
func (r *Repo) LatestPublished(ctx context.Context, siteID uuid.UUID, limit int) ([]Article, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+`
		FROM articles
		WHERE site_id = $1 AND status = 'published'
		ORDER BY published_at DESC NULLS LAST, created_at DESC
		LIMIT $2
	`, siteID, limit)
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
