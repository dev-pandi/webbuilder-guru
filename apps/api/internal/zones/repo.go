// Package zones — TLD catalog authoritative di web builder (per arsitektur
// self-sufficient). Setiap zone punya rules verifikasi dokumen + batas
// registrasi period. Cross-check di CheckDomain: kalau `active=false`,
// zone tidak di-expose ke user meskipun EPP registry masih support.
//
// Pricing per zone di package `pricing` (platform_prices.tld reference by
// convention, bukan hard FK — supaya bisa introduce zone baru tanpa harus
// isi harga dulu).
package zones

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("zone not found")
	ErrTLDTaken = errors.New("zone TLD sudah dipakai")
)

// Zone — 1 row zones catalog.
type Zone struct {
	ID                uuid.UUID  `json:"id"`
	TLD               string     `json:"tld"`               // lowercase, "id", "co.id"
	Label             string     `json:"label"`             // ".id", ".co.id"
	Active            bool       `json:"active"`
	RequireDocument   bool       `json:"require_document"`
	AutoApproved      bool       `json:"auto_approved"`
	NikAutoApproved   bool       `json:"nik_auto_approved"`
	MinYears          int        `json:"min_years"`
	MaxYears          int        `json:"max_years"`
	SortOrder         int        `json:"sort_order"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	UpdatedBy         *uuid.UUID `json:"updated_by,omitempty"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// ListAll — admin: semua zones (active + inactive). Sort by sort_order.
func (r *Repo) ListAll(ctx context.Context) ([]Zone, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, tld, label, active, require_document, auto_approved,
		       nik_auto_approved, min_years, max_years, sort_order,
		       created_at, updated_at, updated_by
		FROM zones
		ORDER BY sort_order ASC, tld ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Zone{}
	for rows.Next() {
		z, err := scanZone(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, z)
	}
	return out, rows.Err()
}

// ListActive — public: hanya active. Wizard cari domain pakai ini.
func (r *Repo) ListActive(ctx context.Context) ([]Zone, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, tld, label, active, require_document, auto_approved,
		       nik_auto_approved, min_years, max_years, sort_order,
		       created_at, updated_at, updated_by
		FROM zones
		WHERE active = true
		ORDER BY sort_order ASC, tld ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Zone{}
	for rows.Next() {
		z, err := scanZone(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, z)
	}
	return out, rows.Err()
}

// GetByTLD — return zone or ErrNotFound. TLD lowercase.
func (r *Repo) GetByTLD(ctx context.Context, tld string) (*Zone, error) {
	tld = strings.ToLower(strings.TrimSpace(tld))
	row := r.pool.QueryRow(ctx, `
		SELECT id, tld, label, active, require_document, auto_approved,
		       nik_auto_approved, min_years, max_years, sort_order,
		       created_at, updated_at, updated_by
		FROM zones WHERE tld = $1
	`, tld)
	z, err := scanZone(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &z, nil
}

// GetByID — admin lookup by UUID.
func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Zone, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, tld, label, active, require_document, auto_approved,
		       nik_auto_approved, min_years, max_years, sort_order,
		       created_at, updated_at, updated_by
		FROM zones WHERE id = $1
	`, id)
	z, err := scanZone(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &z, nil
}

// CreateInput — payload create zone. TLD wajib unique.
type CreateInput struct {
	TLD             string
	Label           string
	RequireDocument bool
	AutoApproved    bool
	NikAutoApproved bool
	MinYears        int
	MaxYears        int
	SortOrder       int
	CreatedBy       *uuid.UUID
}

// Create — return ErrTLDTaken kalau duplicate.
func (r *Repo) Create(ctx context.Context, in CreateInput) (*Zone, error) {
	in.TLD = strings.ToLower(strings.TrimSpace(in.TLD))
	if in.Label == "" {
		in.Label = "." + in.TLD
	}
	if in.MinYears < 1 {
		in.MinYears = 1
	}
	if in.MaxYears < in.MinYears {
		in.MaxYears = 10
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO zones (tld, label, active, require_document, auto_approved,
		                   nik_auto_approved, min_years, max_years, sort_order, updated_by)
		VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, tld, label, active, require_document, auto_approved,
		          nik_auto_approved, min_years, max_years, sort_order,
		          created_at, updated_at, updated_by
	`, in.TLD, in.Label, in.RequireDocument, in.AutoApproved, in.NikAutoApproved,
		in.MinYears, in.MaxYears, in.SortOrder, in.CreatedBy)
	z, err := scanZone(row)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrTLDTaken
		}
		return nil, err
	}
	return &z, nil
}

// UpdateInput — partial update. Nil pointer = don't change field.
type UpdateInput struct {
	Label           *string
	Active          *bool
	RequireDocument *bool
	AutoApproved    *bool
	NikAutoApproved *bool
	MinYears        *int
	MaxYears        *int
	SortOrder       *int
	UpdatedBy       *uuid.UUID
}

// Update — COALESCE pattern; only fields di UpdateInput yang di-touch.
func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Zone, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE zones SET
		    label            = COALESCE($2, label),
		    active           = COALESCE($3, active),
		    require_document = COALESCE($4, require_document),
		    auto_approved    = COALESCE($5, auto_approved),
		    nik_auto_approved= COALESCE($6, nik_auto_approved),
		    min_years        = COALESCE($7, min_years),
		    max_years        = COALESCE($8, max_years),
		    sort_order       = COALESCE($9, sort_order),
		    updated_at       = now(),
		    updated_by       = COALESCE($10, updated_by)
		WHERE id = $1
		RETURNING id, tld, label, active, require_document, auto_approved,
		          nik_auto_approved, min_years, max_years, sort_order,
		          created_at, updated_at, updated_by
	`, id, in.Label, in.Active, in.RequireDocument, in.AutoApproved,
		in.NikAutoApproved, in.MinYears, in.MaxYears, in.SortOrder, in.UpdatedBy)
	z, err := scanZone(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &z, nil
}

// Delete — hard delete. Kalau ada FK check di future (mis. domain_purchases
// referensi tld), harus soft-delete atau reject. Untuk MVP: hard delete.
func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM zones WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- helpers ---

// rowScanner — abstraksi supaya scanZone bisa dipakai untuk *pgx.Row
// (single-row) maupun pgx.Rows (loop).
type rowScanner interface {
	Scan(dest ...any) error
}

func scanZone(r rowScanner) (Zone, error) {
	var z Zone
	err := r.Scan(
		&z.ID, &z.TLD, &z.Label, &z.Active, &z.RequireDocument, &z.AutoApproved,
		&z.NikAutoApproved, &z.MinYears, &z.MaxYears, &z.SortOrder,
		&z.CreatedAt, &z.UpdatedAt, &z.UpdatedBy,
	)
	return z, err
}

// pgErrCode — extract Postgres SQLSTATE code kalau err adalah pgconn.PgError.
// Pattern mirror package lain di codebase (sites, auth). "23505" = unique_violation.
func pgErrCode(err error) string {
	type coder interface{ SQLState() string }
	var c coder
	if errors.As(err, &c) {
		return c.SQLState()
	}
	return ""
}
