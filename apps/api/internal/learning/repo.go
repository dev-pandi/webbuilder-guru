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
//
// ParentID + SortOrder (0064) — hierarki 1-level untuk sidebar nav
// (Fumadocs-style). URL slug tetap flat (unique per site) → link lama
// 100% aman, hirarki hanya untuk UI.
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
	ParentID       *uuid.UUID      `json:"parent_id,omitempty"`
	SortOrder      int             `json:"sort_order"`
	Emoji          string          `json:"emoji"`
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
    tags_json, summary, status, seo_title, seo_description,
    parent_id, sort_order, emoji, published_at, created_at, updated_at`

func scan(m *Material) []any {
	return []any{
		&m.ID, &m.SiteID, &m.Slug, &m.Title, &m.Excerpt, &m.BodyMD, &m.CoverImageURL,
		&m.Tags, &m.Summary, &m.Status, &m.SEOTitle, &m.SEODescription,
		&m.ParentID, &m.SortOrder, &m.Emoji, &m.PublishedAt, &m.CreatedAt, &m.UpdatedAt,
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
	ParentID       *uuid.UUID // nil = top-level materi
	SortOrder      int
	Emoji          string
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
	// Validasi parent (kalau diset): harus top-level (parent_id NULL) + same site_id.
	if in.ParentID != nil {
		if err := r.validateParent(ctx, siteID, *in.ParentID, uuid.Nil); err != nil {
			return nil, err
		}
	}
	var m Material
	err := r.pool.QueryRow(ctx, `
		INSERT INTO learning_materials (site_id, slug, title, excerpt, body_md, cover_image_url,
		    tags_json, summary, status, seo_title, seo_description, parent_id, sort_order, emoji, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING `+cols+`
	`, siteID, in.Slug, in.Title, in.Excerpt, in.BodyMD, in.CoverImageURL,
		in.Tags, in.Summary, in.Status, in.SEOTitle, in.SEODescription,
		in.ParentID, in.SortOrder, in.Emoji, publishedAt,
	).Scan(scan(&m)...)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// Sentinel error untuk parent invalid (dipakai handler untuk map ke 400).
var ErrInvalidParent = errors.New("invalid parent material")

// validateParent enforce: parent harus same site, parent harus top-level
// (bukan child), parent tidak sama dengan diri sendiri (saat update).
func (r *Repo) validateParent(ctx context.Context, siteID, parentID, selfID uuid.UUID) error {
	if parentID == selfID {
		return ErrInvalidParent
	}
	var pSite uuid.UUID
	var pParent *uuid.UUID
	err := r.pool.QueryRow(ctx,
		`SELECT site_id, parent_id FROM learning_materials WHERE id = $1`, parentID,
	).Scan(&pSite, &pParent)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidParent
	}
	if err != nil {
		return err
	}
	if pSite != siteID {
		return ErrInvalidParent
	}
	// Enforce 1-level: parent harus top-level (parent_id NULL).
	if pParent != nil {
		return ErrInvalidParent
	}
	return nil
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
	// Parent control: ParentIDSet=true + ParentID=nil → set NULL (jadi top-level).
	// ParentIDSet=true + ParentID=X → set X. ParentIDSet=false → tidak diubah.
	// Pattern ini supaya kita bisa bedakan "tidak kirim" vs "kirim null".
	ParentIDSet bool
	ParentID    *uuid.UUID
	SortOrder   *int
	Emoji       *string
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Material, error) {
	if in.Status != nil && *in.Status != "draft" && *in.Status != "published" {
		return nil, errors.New("invalid status")
	}
	publishedAtExpr := "published_at"
	if in.Status != nil && *in.Status == "published" {
		publishedAtExpr = "COALESCE(published_at, now())"
	}
	// Validasi parent — perlu lookup site_id dulu untuk pastikan same site.
	if in.ParentIDSet && in.ParentID != nil {
		var siteID uuid.UUID
		if err := r.pool.QueryRow(ctx,
			`SELECT site_id FROM learning_materials WHERE id = $1`, id,
		).Scan(&siteID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if err := r.validateParent(ctx, siteID, *in.ParentID, id); err != nil {
			return nil, err
		}
	}
	// Parent expression: kalau explicit set → pakai $12, else keep existing.
	parentExpr := "parent_id"
	if in.ParentIDSet {
		parentExpr = "$12"
	}
	sortExpr := "COALESCE($13, sort_order)"
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
		    parent_id       = %s,
		    sort_order      = %s,
		    emoji           = COALESCE($14, emoji),
		    published_at    = %s,
		    updated_at      = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, parentExpr, sortExpr, publishedAtExpr)
	var m Material
	err := r.pool.QueryRow(ctx, q, id, in.Slug, in.Title, in.Excerpt, in.BodyMD,
		in.CoverImageURL, jsonOrNil(in.Tags), in.Summary, in.Status,
		in.SEOTitle, in.SEODescription, in.ParentID, in.SortOrder, in.Emoji,
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

// ListParents — all top-level materi (parent_id NULL) in a site, ordered
// by sort_order. Dipakai editor dropdown "Materi Induk".
func (r *Repo) ListParents(ctx context.Context, siteID uuid.UUID) ([]Material, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+`
		FROM learning_materials
		WHERE site_id = $1 AND parent_id IS NULL
		ORDER BY sort_order ASC, created_at ASC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Material{}
	for rows.Next() {
		var m Material
		if err := rows.Scan(scan(&m)...); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// TreeNode — parent + direct children untuk sidebar nav / renderer.
type TreeNode struct {
	Material
	Children []Material `json:"children,omitempty"`
}

// ListTree — materi grouped parent → children untuk sidebar Fumadocs-style.
// Hanya materi `published` yang di-return (dipakai renderer publik). Untuk
// editor pakai ListPage (full list termasuk draft) + separate ListParents.
func (r *Repo) ListTree(ctx context.Context, siteID uuid.UUID) ([]TreeNode, error) {
	// Single query ambil all materi, sort by parent group lalu order.
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+`
		FROM learning_materials
		WHERE site_id = $1 AND status = 'published'
		ORDER BY sort_order ASC, created_at ASC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var parents []Material
	children := map[uuid.UUID][]Material{}
	for rows.Next() {
		var m Material
		if err := rows.Scan(scan(&m)...); err != nil {
			return nil, err
		}
		if m.ParentID == nil {
			parents = append(parents, m)
		} else {
			children[*m.ParentID] = append(children[*m.ParentID], m)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]TreeNode, 0, len(parents))
	for _, p := range parents {
		out = append(out, TreeNode{Material: p, Children: children[p.ID]})
	}
	// Orphan children (parent di-draft / di-hapus): append tanpa parent group.
	// Supaya tetap kelihatan di sidebar sebagai top-level.
	for pid, kids := range children {
		found := false
		for _, p := range parents {
			if p.ID == pid {
				found = true
				break
			}
		}
		if !found {
			for _, k := range kids {
				out = append(out, TreeNode{Material: k})
			}
		}
	}
	return out, nil
}

// SwapOrder — swap sort_order materi `self` dengan sibling tetangga (atas/
// bawah). Scope sibling: sesama parent_id (atau sesama top-level kalau
// self.ParentID NULL). Idempotent kalau sudah di posisi ujung.
//
// Catatan: pakai 2x UPDATE dalam transaksi supaya sort_order unik tidak
// konflik (walau DB tidak enforce unique). Kalau sort_order sama (default 0
// semua), fallback ke created_at ordering.
func (r *Repo) SwapOrder(ctx context.Context, self *Material, direction string) error {
	// Cari sibling tetangga sesuai direction.
	var sibling Material
	var err error
	if self.ParentID == nil {
		if direction == "up" {
			err = r.pool.QueryRow(ctx, `
				SELECT `+cols+` FROM learning_materials
				WHERE site_id = $1 AND parent_id IS NULL AND id <> $2
				  AND (sort_order, created_at) < ($3, $4)
				ORDER BY sort_order DESC, created_at DESC LIMIT 1
			`, self.SiteID, self.ID, self.SortOrder, self.CreatedAt).Scan(scan(&sibling)...)
		} else {
			err = r.pool.QueryRow(ctx, `
				SELECT `+cols+` FROM learning_materials
				WHERE site_id = $1 AND parent_id IS NULL AND id <> $2
				  AND (sort_order, created_at) > ($3, $4)
				ORDER BY sort_order ASC, created_at ASC LIMIT 1
			`, self.SiteID, self.ID, self.SortOrder, self.CreatedAt).Scan(scan(&sibling)...)
		}
	} else {
		if direction == "up" {
			err = r.pool.QueryRow(ctx, `
				SELECT `+cols+` FROM learning_materials
				WHERE site_id = $1 AND parent_id = $2 AND id <> $3
				  AND (sort_order, created_at) < ($4, $5)
				ORDER BY sort_order DESC, created_at DESC LIMIT 1
			`, self.SiteID, *self.ParentID, self.ID, self.SortOrder, self.CreatedAt).Scan(scan(&sibling)...)
		} else {
			err = r.pool.QueryRow(ctx, `
				SELECT `+cols+` FROM learning_materials
				WHERE site_id = $1 AND parent_id = $2 AND id <> $3
				  AND (sort_order, created_at) > ($4, $5)
				ORDER BY sort_order ASC, created_at ASC LIMIT 1
			`, self.SiteID, *self.ParentID, self.ID, self.SortOrder, self.CreatedAt).Scan(scan(&sibling)...)
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		// Already at edge — no-op idempotent.
		return nil
	}
	if err != nil {
		return err
	}
	// Swap sort_order dalam transaksi.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx,
		`UPDATE learning_materials SET sort_order = $1, updated_at = now() WHERE id = $2`,
		sibling.SortOrder, self.ID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE learning_materials SET sort_order = $1, updated_at = now() WHERE id = $2`,
		self.SortOrder, sibling.ID,
	); err != nil {
		return err
	}
	// Kalau sort_order asalnya sama (default 0 semua), swap jadi no-op.
	// Fix dengan reseed: self jadi sibling.SortOrder, sibling jadi
	// sibling.SortOrder +/- 1 sesuai direction.
	if self.SortOrder == sibling.SortOrder {
		delta := 1
		if direction == "up" {
			delta = -1
		}
		if _, err := tx.Exec(ctx,
			`UPDATE learning_materials SET sort_order = $1, updated_at = now() WHERE id = $2`,
			sibling.SortOrder+delta, self.ID,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// Siblings — list materi di parent yang sama (atau top-level kalau parent_id
// NULL). Dipakai renderer untuk Prev/Next CTA. Return hanya materi published.
func (r *Repo) Siblings(ctx context.Context, siteID uuid.UUID, parentID *uuid.UUID) ([]Material, error) {
	var rows pgx.Rows
	var err error
	if parentID == nil {
		rows, err = r.pool.Query(ctx, `
			SELECT `+cols+` FROM learning_materials
			WHERE site_id = $1 AND parent_id IS NULL AND status = 'published'
			ORDER BY sort_order ASC, created_at ASC
		`, siteID)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT `+cols+` FROM learning_materials
			WHERE site_id = $1 AND parent_id = $2 AND status = 'published'
			ORDER BY sort_order ASC, created_at ASC
		`, siteID, *parentID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Material{}
	for rows.Next() {
		var m Material
		if err := rows.Scan(scan(&m)...); err != nil {
			return nil, err
		}
		out = append(out, m)
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
