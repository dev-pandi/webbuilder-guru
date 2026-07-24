package cloudflare

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("cloudflare config not found")

const cols = `id, name, api_token, account_id, is_default, created_at, updated_at`

func scan(row pgx.Row, c *Config) error {
	return row.Scan(&c.ID, &c.Name, &c.APIToken, &c.AccountID, &c.IsDefault, &c.CreatedAt, &c.UpdatedAt)
}

// List = semua config, sort default dulu lalu created_at desc.
func (r *Repo) List(ctx context.Context) ([]Config, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+cols+` FROM cloudflare_configs ORDER BY is_default DESC, created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Config
	for rows.Next() {
		var c Config
		if err := scan(rows, &c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Config, error) {
	var c Config
	err := scan(r.pool.QueryRow(ctx, `SELECT `+cols+` FROM cloudflare_configs WHERE id = $1`, id), &c)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

// GetDefault = config yang di-mark `is_default=true`. Dipakai auto-attach
// flow di webhook handler.
func (r *Repo) GetDefault(ctx context.Context) (*Config, error) {
	var c Config
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM cloudflare_configs WHERE is_default = true LIMIT 1`,
	), &c)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

// Create insert config baru. Kalau IsDefault=true, unset semua config lain
// dalam 1 transaction supaya partial index unique tidak konflik.
func (r *Repo) Create(ctx context.Context, c *Config) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if c.IsDefault {
		if _, err := tx.Exec(ctx, `UPDATE cloudflare_configs SET is_default = false WHERE is_default = true`); err != nil {
			return err
		}
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO cloudflare_configs (name, api_token, account_id, is_default)
		VALUES ($1,$2,$3,$4)
		RETURNING `+cols,
		c.Name, c.APIToken, c.AccountID, c.IsDefault,
	).Scan(&c.ID, &c.Name, &c.APIToken, &c.AccountID, &c.IsDefault, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Update patch field. Pointer arg = "leave untouched kalau nil"; empty
// string = "clear" hanya untuk field yang sensible di-clear (bukan token).
func (r *Repo) Update(ctx context.Context, id uuid.UUID, name, apiToken, accountID *string, isDefault *bool) (*Config, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if isDefault != nil && *isDefault {
		if _, err := tx.Exec(ctx,
			`UPDATE cloudflare_configs SET is_default = false WHERE is_default = true AND id <> $1`,
			id,
		); err != nil {
			return nil, err
		}
	}
	var c Config
	err = scan(tx.QueryRow(ctx, `
		UPDATE cloudflare_configs
		   SET name       = COALESCE($2, name),
		       api_token  = COALESCE($3, api_token),
		       account_id = COALESCE($4, account_id),
		       is_default = COALESCE($5, is_default),
		       updated_at = now()
		 WHERE id = $1
		 RETURNING `+cols,
		id, name, apiToken, accountID, isDefault,
	), &c)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM cloudflare_configs WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetDefault atomically mark 1 config sebagai default (unset lainnya).
func (r *Repo) SetDefault(ctx context.Context, id uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE cloudflare_configs SET is_default = false WHERE is_default = true`); err != nil {
		return err
	}
	ct, err := tx.Exec(ctx,
		`UPDATE cloudflare_configs SET is_default = true, updated_at = now() WHERE id = $1`, id,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

var _ = time.Now
