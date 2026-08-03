// Package settings — generic key-value config store untuk value yang admin
// bisa ubah tanpa redeploy (PPN rate, brand name, support contact, dsb.).
//
// Layer:
//   repo.go    — raw CRUD (Get/Set/List) di table system_settings
//   service.go — typed accessors + in-memory cache (60s TTL) supaya konsumen
//                (invoice generator, email template) tidak query DB tiap
//                render. Cache invalidated on Set.
//   handler.go — admin HTTP CRUD.
//
// Convention: key = `<namespace>.<key>` (mis. `tax.ppn_rate`, `brand.name`).
package settings

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("setting not found")

// Setting — 1 row dari system_settings.
type Setting struct {
	Key         string     `json:"key"`
	Value       string     `json:"value"`
	Description string     `json:"description"`
	UpdatedAt   time.Time  `json:"updated_at"`
	UpdatedBy   *uuid.UUID `json:"updated_by,omitempty"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// List all settings sorted by key. Admin panel: 1 flat list, filter di FE.
func (r *Repo) List(ctx context.Context) ([]Setting, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT key, value, description, updated_at, updated_by
		FROM system_settings ORDER BY key ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Setting{}
	for rows.Next() {
		var s Setting
		if err := rows.Scan(&s.Key, &s.Value, &s.Description, &s.UpdatedAt, &s.UpdatedBy); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Get single setting by key. ErrNotFound kalau key tidak ada — caller yang
// mau default fallback pakai Service accessors (bukan Get langsung).
func (r *Repo) Get(ctx context.Context, key string) (*Setting, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT key, value, description, updated_at, updated_by
		FROM system_settings WHERE key = $1
	`, key)
	var s Setting
	if err := row.Scan(&s.Key, &s.Value, &s.Description, &s.UpdatedAt, &s.UpdatedBy); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

// Set upserts key + value. Description hanya di-set di INSERT (tidak overwrite
// pada UPDATE — supaya admin edit value tanpa lupa description).
func (r *Repo) Set(ctx context.Context, key, value string, updatedBy *uuid.UUID) (*Setting, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO system_settings (key, value, updated_by)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO UPDATE SET
		    value = EXCLUDED.value,
		    updated_at = now(),
		    updated_by = EXCLUDED.updated_by
		RETURNING key, value, description, updated_at, updated_by
	`, key, value, updatedBy)
	var s Setting
	if err := row.Scan(&s.Key, &s.Value, &s.Description, &s.UpdatedAt, &s.UpdatedBy); err != nil {
		return nil, err
	}
	return &s, nil
}
