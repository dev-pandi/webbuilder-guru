package banners

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Banner = "Promotion Banner" / Ruang Promosi. Spec §11.4, §27.
type Banner struct {
	ID                  uuid.UUID  `json:"id"`
	SiteID              uuid.UUID  `json:"site_id"`
	OwnerUserID         uuid.UUID  `json:"owner_user_id"`
	InternalTitle       string     `json:"internal_title"`
	ImageURL            string     `json:"image_url"`
	TargetURL           string     `json:"target_url"`
	AltText             string     `json:"alt_text"`
	SortOrder           int        `json:"sort_order"`
	StartAt             *time.Time `json:"start_at,omitempty"`
	EndAt               *time.Time `json:"end_at,omitempty"`
	TeacherActive       bool       `json:"teacher_active"`
	AdminEnabled        bool       `json:"admin_enabled"`
	AdminDisabledReason string     `json:"admin_disabled_reason"`
	AdminDisabledBy     *uuid.UUID `json:"admin_disabled_by,omitempty"`
	AdminDisabledAt     *time.Time `json:"admin_disabled_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// EffectiveStatus — human-friendly status label. Spec §24.
func (b Banner) EffectiveStatus(now time.Time) string {
	if !b.AdminEnabled {
		return "admin_disabled"
	}
	if !b.TeacherActive {
		return "teacher_off"
	}
	if b.StartAt != nil && now.Before(*b.StartAt) {
		return "not_started"
	}
	if b.EndAt != nil && now.After(*b.EndAt) {
		return "ended"
	}
	return "active"
}

// PublicView — excludes admin control + owner info. What renderer sees.
type PublicView struct {
	ID        uuid.UUID `json:"id"`
	ImageURL  string    `json:"image_url"`
	TargetURL string    `json:"target_url"`
	AltText   string    `json:"alt_text"`
	SortOrder int       `json:"sort_order"`
}

// PortalView — Ruang Promosi Portal (aggregate cross-site). Include site info
// karena portal beda konteks.
type PortalView struct {
	ID        uuid.UUID `json:"id"`
	SiteID    uuid.UUID `json:"site_id"`
	ImageURL  string    `json:"image_url"`
	TargetURL string    `json:"target_url"`
	AltText   string    `json:"alt_text"`
}

// AdminView — admin dashboard list. Include site + owner info.
type AdminView struct {
	Banner
	SiteName  string `json:"site_name"`
	SiteSlug  string `json:"site_slug"`
	OwnerName string `json:"owner_name"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("banner not found")

const cols = `id, site_id, owner_user_id, internal_title, image_url, target_url, alt_text,
    sort_order, start_at, end_at, teacher_active, admin_enabled,
    admin_disabled_reason, admin_disabled_by, admin_disabled_at, created_at, updated_at`

func scan(b *Banner) []any {
	return []any{
		&b.ID, &b.SiteID, &b.OwnerUserID, &b.InternalTitle, &b.ImageURL, &b.TargetURL, &b.AltText,
		&b.SortOrder, &b.StartAt, &b.EndAt, &b.TeacherActive, &b.AdminEnabled,
		&b.AdminDisabledReason, &b.AdminDisabledBy, &b.AdminDisabledAt, &b.CreatedAt, &b.UpdatedAt,
	}
}

type CreateInput struct {
	SiteID        uuid.UUID
	OwnerUserID   uuid.UUID
	InternalTitle string
	ImageURL      string
	TargetURL     string
	AltText       string
	SortOrder     int
	StartAt       *time.Time
	EndAt         *time.Time
	TeacherActive bool
}

func (r *Repo) Create(ctx context.Context, in CreateInput) (*Banner, error) {
	var b Banner
	err := r.pool.QueryRow(ctx, `
		INSERT INTO promotion_banners (site_id, owner_user_id, internal_title, image_url, target_url,
		    alt_text, sort_order, start_at, end_at, teacher_active)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING `+cols+`
	`, in.SiteID, in.OwnerUserID, in.InternalTitle, in.ImageURL, in.TargetURL,
		in.AltText, in.SortOrder, in.StartAt, in.EndAt, in.TeacherActive,
	).Scan(scan(&b)...)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

type UpdateInput struct {
	InternalTitle *string
	ImageURL      *string
	TargetURL     *string
	AltText       *string
	SortOrder     *int
	StartAt       *time.Time // pointer — nil field distinguished from nil value via ClearStart
	EndAt         *time.Time
	ClearStart    bool
	ClearEnd      bool
	TeacherActive *bool
}

// Update — teacher-facing update (does NOT touch admin_enabled).
func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Banner, error) {
	// Build dynamic SET clauses to distinguish "not sent" vs "explicit null" for periods.
	sets := []string{"updated_at = now()"}
	args := []any{id}
	add := func(sql string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf(sql, len(args)))
	}
	if in.InternalTitle != nil {
		add("internal_title = $%d", *in.InternalTitle)
	}
	if in.ImageURL != nil {
		add("image_url = $%d", *in.ImageURL)
	}
	if in.TargetURL != nil {
		add("target_url = $%d", *in.TargetURL)
	}
	if in.AltText != nil {
		add("alt_text = $%d", *in.AltText)
	}
	if in.SortOrder != nil {
		add("sort_order = $%d", *in.SortOrder)
	}
	if in.ClearStart {
		sets = append(sets, "start_at = NULL")
	} else if in.StartAt != nil {
		add("start_at = $%d", *in.StartAt)
	}
	if in.ClearEnd {
		sets = append(sets, "end_at = NULL")
	} else if in.EndAt != nil {
		add("end_at = $%d", *in.EndAt)
	}
	if in.TeacherActive != nil {
		add("teacher_active = $%d", *in.TeacherActive)
	}
	q := fmt.Sprintf(`UPDATE promotion_banners SET %s WHERE id = $1 RETURNING `+cols,
		joinComma(sets))
	var b Banner
	err := r.pool.QueryRow(ctx, q, args...).Scan(scan(&b)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &b, err
}

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}

// SetAdminEnabled — admin override. Optional reason.
func (r *Repo) SetAdminEnabled(ctx context.Context, id uuid.UUID, enabled bool, adminID uuid.UUID, reason string) (*Banner, error) {
	var b Banner
	err := r.pool.QueryRow(ctx, `
		UPDATE promotion_banners SET
		    admin_enabled = $2,
		    admin_disabled_reason = CASE WHEN $2 THEN '' ELSE $4 END,
		    admin_disabled_by = CASE WHEN $2 THEN NULL ELSE $3 END,
		    admin_disabled_at = CASE WHEN $2 THEN NULL ELSE now() END,
		    updated_at = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, id, enabled, adminID, reason).Scan(scan(&b)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &b, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Banner, error) {
	var b Banner
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM promotion_banners WHERE id = $1`, id).Scan(scan(&b)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &b, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM promotion_banners WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListBySite — teacher dashboard. Returns ALL banners guru miliknya (including
// admin-disabled ones — dashboard tampilkan status "Dinonaktifkan oleh Admin").
func (r *Repo) ListBySite(ctx context.Context, siteID uuid.UUID) ([]Banner, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+`
		FROM promotion_banners
		WHERE site_id = $1
		ORDER BY sort_order ASC, created_at DESC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Banner{}
	for rows.Next() {
		var b Banner
		if err := rows.Scan(scan(&b)...); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ListEligibleBySite — public renderer view. Only banners that satisfy all rules.
func (r *Repo) ListEligibleBySite(ctx context.Context, siteID uuid.UUID) ([]PublicView, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, image_url, target_url, alt_text, sort_order
		FROM promotion_banners
		WHERE site_id = $1
		  AND teacher_active = true
		  AND admin_enabled  = true
		  AND (start_at IS NULL OR start_at <= now())
		  AND (end_at   IS NULL OR end_at   >= now())
		ORDER BY sort_order ASC, created_at DESC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PublicView{}
	for rows.Next() {
		var v PublicView
		if err := rows.Scan(&v.ID, &v.ImageURL, &v.TargetURL, &v.AltText, &v.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ListEligibleForPortal — cross-site aggregate untuk Ruang Promosi Portal (§6).
// Limit N default 30 supaya carousel portal tidak overload.
func (r *Repo) ListEligibleForPortal(ctx context.Context, limit int) ([]PortalView, error) {
	if limit <= 0 || limit > 200 {
		limit = 30
	}
	rows, err := r.pool.Query(ctx, `
		SELECT b.id, b.site_id, b.image_url, b.target_url, b.alt_text
		FROM promotion_banners b
		JOIN sites s ON s.id = b.site_id
		WHERE b.teacher_active = true
		  AND b.admin_enabled  = true
		  AND (b.start_at IS NULL OR b.start_at <= now())
		  AND (b.end_at   IS NULL OR b.end_at   >= now())
		  AND s.status = 'published'
		ORDER BY b.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PortalView{}
	for rows.Next() {
		var v PortalView
		if err := rows.Scan(&v.ID, &v.SiteID, &v.ImageURL, &v.TargetURL, &v.AltText); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// AdminListPage — admin cross-site dashboard.
func (r *Repo) AdminListPage(ctx context.Context, statusFilter string, limit, offset int) ([]AdminView, int, error) {
	where := ""
	switch statusFilter {
	case "admin_enabled":
		where = " WHERE b.admin_enabled = true"
	case "admin_disabled":
		where = " WHERE b.admin_enabled = false"
	}
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM promotion_banners b`+where,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+prefixCols("b")+`, s.name, s.slug, COALESCE(u.name, u.email)
		FROM promotion_banners b
		JOIN sites s ON s.id = b.site_id
		JOIN users u ON u.id = b.owner_user_id
		`+where+`
		ORDER BY b.created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []AdminView{}
	for rows.Next() {
		var av AdminView
		s := scan(&av.Banner)
		s = append(s, &av.SiteName, &av.SiteSlug, &av.OwnerName)
		if err := rows.Scan(s...); err != nil {
			return nil, 0, err
		}
		out = append(out, av)
	}
	return out, total, rows.Err()
}

func prefixCols(prefix string) string {
	// Rebuild `cols` with alias prefix. Keeping in one place to stay in sync.
	fields := []string{
		"id", "site_id", "owner_user_id", "internal_title", "image_url", "target_url", "alt_text",
		"sort_order", "start_at", "end_at", "teacher_active", "admin_enabled",
		"admin_disabled_reason", "admin_disabled_by", "admin_disabled_at", "created_at", "updated_at",
	}
	out := ""
	for i, f := range fields {
		if i > 0 {
			out += ", "
		}
		out += prefix + "." + f
	}
	return out
}

// CountActiveBySite — dashboard ringkasan.
func (r *Repo) CountActiveBySite(ctx context.Context, siteID uuid.UUID) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM promotion_banners
		WHERE site_id = $1
		  AND teacher_active = true
		  AND admin_enabled  = true
		  AND (start_at IS NULL OR start_at <= now())
		  AND (end_at   IS NULL OR end_at   >= now())
	`, siteID).Scan(&n)
	return n, err
}
