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

// Version is one historical snapshot of a page.
type Version struct {
	ID        uuid.UUID       `json:"id"`
	PageID    uuid.UUID       `json:"page_id"`
	Version   int             `json:"version"`
	Title     string          `json:"title"`
	Tree      json.RawMessage `json:"tree"`
	SEO       json.RawMessage `json:"seo"`
	CreatedBy *uuid.UUID      `json:"created_by,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

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

	// Published snapshot — separate from `tree` so the editor can iterate on a
	// draft without affecting the live site. Public endpoints serve
	// `PublishedTree` (with fallback to draft for pages never published).
	PublishedTree json.RawMessage `json:"published_tree,omitempty"`
	PublishedAt   *time.Time      `json:"published_at,omitempty"`

	// ScheduledPublishAt — kalau set, background worker akan publish otomatis
	// saat waktu tercapai. Manual publish membersihkan field ini. Nil = tidak
	// terjadwal.
	ScheduledPublishAt *time.Time `json:"scheduled_publish_at,omitempty"`
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
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
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
		if err := rows.Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
		FROM pages WHERE id = $1
	`, id).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) GetBySiteAndSlug(ctx context.Context, siteID uuid.UUID, slug string) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
		FROM pages WHERE site_id = $1 AND slug = $2
	`, siteID, slug).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) GetHomeOfSite(ctx context.Context, siteID uuid.UUID) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
		FROM pages WHERE site_id = $1 AND is_home = true LIMIT 1
	`, siteID).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt)
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
		RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
	`, siteID, slug, title, tree, seo, isHome).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt,
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

// Update applies optional patches to a page. When `tree` or `title` changes,
// snapshots the previous state into page_versions so the user can restore it.
func (r *Repo) Update(ctx context.Context, id uuid.UUID, title *string, tree, seo json.RawMessage, isHome *bool, slug *string, by *uuid.UUID) (*Page, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Snapshot the BEFORE state — only for content-bearing changes (tree/title/seo).
	if tree != nil || title != nil || seo != nil {
		var prev Page
		err := tx.QueryRow(ctx, `
			SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
			FROM pages WHERE id = $1
		`, id).Scan(&prev.ID, &prev.SiteID, &prev.Slug, &prev.Title, &prev.Tree, &prev.SEO, &prev.IsHome, &prev.Version, &prev.CreatedAt, &prev.UpdatedAt, &prev.PublishedTree, &prev.PublishedAt, &prev.ScheduledPublishAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO page_versions (page_id, version, title, tree_json, seo_json, created_by)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, prev.ID, prev.Version, prev.Title, prev.Tree, prev.SEO, by); err != nil {
			return nil, err
		}
	}

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
		RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
	`, id, title, tree, seo, isHome, slug).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt,
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

// ListVersions returns up to `limit` recent versions of a page.
func (r *Repo) ListVersions(ctx context.Context, pageID uuid.UUID, limit int) ([]Version, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, page_id, version, title, tree_json, seo_json, created_by, created_at
		FROM page_versions WHERE page_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, pageID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Version{}
	for rows.Next() {
		var v Version
		if err := rows.Scan(&v.ID, &v.PageID, &v.Version, &v.Title, &v.Tree, &v.SEO, &v.CreatedBy, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// GetVersion fetches one specific version.
func (r *Repo) GetVersion(ctx context.Context, versionID uuid.UUID) (*Version, error) {
	var v Version
	err := r.pool.QueryRow(ctx, `
		SELECT id, page_id, version, title, tree_json, seo_json, created_by, created_at
		FROM page_versions WHERE id = $1
	`, versionID).Scan(&v.ID, &v.PageID, &v.Version, &v.Title, &v.Tree, &v.SEO, &v.CreatedBy, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &v, err
}

// Restore copies an old version's title/tree/seo back onto the page, snapshotting
// the current state first as a new version (so restore is itself undoable).
func (r *Repo) Restore(ctx context.Context, versionID uuid.UUID, createdBy *uuid.UUID) (*Page, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var v Version
	err = tx.QueryRow(ctx, `
		SELECT id, page_id, version, title, tree_json, seo_json, created_by, created_at
		FROM page_versions WHERE id = $1
	`, versionID).Scan(&v.ID, &v.PageID, &v.Version, &v.Title, &v.Tree, &v.SEO, &v.CreatedBy, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// snapshot current first
	var current Page
	err = tx.QueryRow(ctx, `
		SELECT id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
		FROM pages WHERE id = $1
	`, v.PageID).Scan(&current.ID, &current.SiteID, &current.Slug, &current.Title, &current.Tree, &current.SEO, &current.IsHome, &current.Version, &current.CreatedAt, &current.UpdatedAt, &current.PublishedTree, &current.PublishedAt)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO page_versions (page_id, version, title, tree_json, seo_json, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, current.ID, current.Version, current.Title, current.Tree, current.SEO, createdBy); err != nil {
		return nil, err
	}

	// apply old content
	var p Page
	err = tx.QueryRow(ctx, `
		UPDATE pages SET
		    title      = $2,
		    tree_json  = $3,
		    seo_json   = $4,
		    version    = version + 1,
		    updated_at = now()
		WHERE id = $1
		RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
	`, v.PageID, v.Title, v.Tree, v.SEO).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO, &p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt,
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &p, nil
}

// PruneOldVersions keeps only the latest N versions per page.
func (r *Repo) PruneOldVersions(ctx context.Context, pageID uuid.UUID, keep int) error {
	if keep <= 0 {
		keep = 50
	}
	_, err := r.pool.Exec(ctx, `
		DELETE FROM page_versions
		WHERE page_id = $1
		  AND id NOT IN (
		    SELECT id FROM page_versions WHERE page_id = $1
		    ORDER BY created_at DESC LIMIT $2
		  )
	`, pageID, keep)
	return err
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

// Publish copies the current draft (tree_json) into published_tree_json and
// sets published_at = now(). Returns the refreshed Page so the editor can
// surface the new live timestamp immediately.
//
// Membersihkan scheduled_publish_at: manual publish otomatis batalkan jadwal
// yang tertunda supaya worker tidak "publish ulang" beberapa menit kemudian.
func (r *Repo) Publish(ctx context.Context, id uuid.UUID) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		UPDATE pages
		   SET published_tree_json  = tree_json,
		       published_at         = now(),
		       scheduled_publish_at = NULL
		 WHERE id = $1
		 RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
	`, id).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO,
		&p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// Schedule sets scheduled_publish_at ke waktu future. Value harus > now di
// caller (handler validate); repo tidak enforce. Return refreshed Page.
func (r *Repo) Schedule(ctx context.Context, id uuid.UUID, at time.Time) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		UPDATE pages
		   SET scheduled_publish_at = $2
		 WHERE id = $1
		 RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
	`, id, at).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO,
		&p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// Unschedule clears the pending schedule tanpa mengubah publish state.
func (r *Repo) Unschedule(ctx context.Context, id uuid.UUID) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		UPDATE pages
		   SET scheduled_publish_at = NULL
		 WHERE id = $1
		 RETURNING id, site_id, slug, title, tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
	`, id).Scan(
		&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO,
		&p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// ListDueForPublish return baris pages yang scheduled_publish_at <= now.
// Dipanggil background worker tiap ~60 detik. Batas max supaya worker tidak
// stuck di batch besar kalau tabel penuh backlog (mis. hasil migrasi salah
// yang bikin banyak jadwal barengan). Sisanya akan di-pickup iterasi berikut.
func (r *Repo) ListDueForPublish(ctx context.Context, now time.Time, max int) ([]uuid.UUID, error) {
	if max <= 0 || max > 500 {
		max = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM pages
		 WHERE scheduled_publish_at IS NOT NULL
		   AND scheduled_publish_at <= $1
		 ORDER BY scheduled_publish_at ASC
		 LIMIT $2
	`, now, max)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// Unpublish clears the published snapshot so the page disappears from the
// public renderer. Draft (tree_json) is untouched — the editor still has it.
func (r *Repo) Unpublish(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE pages SET published_tree_json = NULL, published_at = NULL WHERE id = $1
	`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListBySitePublic returns the LIVE tree (published_tree_json) for renderer
// consumption. Pages without a published snapshot are skipped entirely —
// they exist only in the editor's draft view.
//
// EXISTS check pada sites + filter status='published' — defense in depth:
// kalau admin unpublish site setelah renderer resolve site.id, endpoint ini
// tetap return kosong (bukan expose page dari site draft).
func (r *Repo) ListBySitePublic(ctx context.Context, siteID uuid.UUID) ([]Page, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, site_id, slug, title, published_tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
		FROM pages
		WHERE site_id = $1 AND published_tree_json IS NOT NULL
		  AND EXISTS (SELECT 1 FROM sites WHERE id = $1 AND status = 'published')
		ORDER BY is_home DESC, slug ASC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Page{}
	for rows.Next() {
		var p Page
		if err := rows.Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO,
			&p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetBySiteAndSlugPublic returns the LIVE page (with published_tree_json
// presented AS `tree` so the renderer code path stays unchanged). 404 when
// the page exists but hasn't been published, ATAU kalau site di-unpublish
// (EXISTS check pada sites dengan status='published').
func (r *Repo) GetBySiteAndSlugPublic(ctx context.Context, siteID uuid.UUID, slug string) (*Page, error) {
	var p Page
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, slug, title, published_tree_json, seo_json, is_home, version, created_at, updated_at, published_tree_json, published_at, scheduled_publish_at
		FROM pages
		WHERE site_id = $1 AND slug = $2 AND published_tree_json IS NOT NULL
		  AND EXISTS (SELECT 1 FROM sites WHERE id = $1 AND status = 'published')
	`, siteID, slug).Scan(&p.ID, &p.SiteID, &p.Slug, &p.Title, &p.Tree, &p.SEO,
		&p.IsHome, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PublishedTree, &p.PublishedAt, &p.ScheduledPublishAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
