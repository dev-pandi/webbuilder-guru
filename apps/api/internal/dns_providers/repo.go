// Package dns_providers manages the dns_provider_configs table — admin CRUD,
// priority ordering, health status caching. Separate from the per-request
// factory (dnsprovider package) to keep DB concerns out of the hot path.
package dns_providers

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Kind values mirror the CHECK constraint on dns_provider_configs.kind +
// dnsprovider.Kind. Duplicated as plain strings here to avoid pulling the
// dnsprovider package into every admin handler.
const (
	KindCloudflare = "cloudflare"
	KindDNSCloud   = "dnscloud"
)

// Config = one row of dns_provider_configs.
type Config struct {
	ID           uuid.UUID
	Kind         string
	Name         string
	APIToken     string
	AccountID    string // CF only; "" for DNSCloud
	IsDefault    bool
	IsActive     bool
	Priority     int
	ZoneQuota    int // 0 = unlimited (soft cap for alerting)
	ZonesCount   int
	LastHealthAt *time.Time
	LastHealthOK *bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

var (
	ErrNotFound      = errors.New("dns provider config not found")
	ErrKindInvalid   = errors.New("kind must be 'cloudflare' or 'dnscloud'")
	ErrDuplicateName = errors.New("name already exists for this kind")
)

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

const cols = `id, kind, name, api_token, account_id, is_default, is_active,
	priority, zone_quota, zones_count, last_health_at, last_health_ok,
	created_at, updated_at`

func scan(row pgx.Row, c *Config) error {
	return row.Scan(
		&c.ID, &c.Kind, &c.Name, &c.APIToken, &c.AccountID,
		&c.IsDefault, &c.IsActive, &c.Priority, &c.ZoneQuota, &c.ZonesCount,
		&c.LastHealthAt, &c.LastHealthOK, &c.CreatedAt, &c.UpdatedAt,
	)
}

// --- List / Get -------------------------------------------------------------

// List returns all configs ordered by priority ASC (active ones first), with
// inactive at the tail. UI shows them grouped by priority so drag-reorder is
// visual + unambiguous.
func (r *Repo) List(ctx context.Context) ([]Config, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+` FROM dns_provider_configs
		 ORDER BY is_active DESC, priority ASC, created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Config{}
	for rows.Next() {
		var c Config
		if err := scan(rows, &c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListActiveByPriority is the factory's primary read path. Returns only
// is_active=true rows sorted by priority ASC. Caller picks the first row
// matching the requested kind (or the overall first for "default" choice).
func (r *Repo) ListActiveByPriority(ctx context.Context) ([]Config, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+` FROM dns_provider_configs
		 WHERE is_active = true
		 ORDER BY priority ASC, created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Config{}
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
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM dns_provider_configs WHERE id = $1`, id), &c)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

// GetHighestPriorityForKind returns the active config with the lowest priority
// number for a given kind. Used by factory when user picked an explicit kind
// at Connect/Purchase. Returns ErrNotFound if no active config of that kind.
func (r *Repo) GetHighestPriorityForKind(ctx context.Context, kind string) (*Config, error) {
	var c Config
	err := scan(r.pool.QueryRow(ctx, `
		SELECT `+cols+` FROM dns_provider_configs
		 WHERE kind = $1 AND is_active = true
		 ORDER BY priority ASC, created_at ASC
		 LIMIT 1
	`, kind), &c)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

// GetHighestPriority — overall best config (any kind). Factory default when
// user did not specify a kind.
func (r *Repo) GetHighestPriority(ctx context.Context) (*Config, error) {
	var c Config
	err := scan(r.pool.QueryRow(ctx, `
		SELECT `+cols+` FROM dns_provider_configs
		 WHERE is_active = true
		 ORDER BY priority ASC, created_at ASC
		 LIMIT 1
	`), &c)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

// --- Mutations --------------------------------------------------------------

type CreateInput struct {
	Kind      string
	Name      string
	APIToken  string
	AccountID string // required if Kind=cloudflare
	Priority  int
	ZoneQuota int
	IsDefault bool
	IsActive  bool
}

func (r *Repo) Create(ctx context.Context, in CreateInput) (*Config, error) {
	if in.Kind != KindCloudflare && in.Kind != KindDNSCloud {
		return nil, ErrKindInvalid
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Default-per-kind: unset existing default of same kind so partial unique
	// index is satisfied.
	if in.IsDefault {
		if _, err := tx.Exec(ctx,
			`UPDATE dns_provider_configs SET is_default = false
			  WHERE kind = $1 AND is_default = true`,
			in.Kind,
		); err != nil {
			return nil, err
		}
	}

	var c Config
	err = scan(tx.QueryRow(ctx, `
		INSERT INTO dns_provider_configs
		(kind, name, api_token, account_id, is_default, is_active, priority, zone_quota)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING `+cols,
		in.Kind, in.Name, in.APIToken, in.AccountID,
		in.IsDefault, in.IsActive, in.Priority, in.ZoneQuota,
	), &c)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &c, nil
}

// UpdateFields — partial update. Nil pointer = leave untouched. api_token
// cannot be cleared (empty string = untouched); operator must create a new
// config instead to rotate a leaked token.
type UpdateFields struct {
	Name      *string
	APIToken  *string
	AccountID *string
	IsDefault *bool
	IsActive  *bool
	Priority  *int
	ZoneQuota *int
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, f UpdateFields) (*Config, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Need current kind for the default-per-kind swap.
	var kind string
	if err := tx.QueryRow(ctx,
		`SELECT kind FROM dns_provider_configs WHERE id = $1`, id,
	).Scan(&kind); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if f.IsDefault != nil && *f.IsDefault {
		if _, err := tx.Exec(ctx,
			`UPDATE dns_provider_configs SET is_default = false
			  WHERE kind = $1 AND is_default = true AND id <> $2`,
			kind, id,
		); err != nil {
			return nil, err
		}
	}

	var c Config
	err = scan(tx.QueryRow(ctx, `
		UPDATE dns_provider_configs SET
			name       = COALESCE($2, name),
			api_token  = COALESCE(NULLIF($3, ''), api_token),
			account_id = COALESCE($4, account_id),
			is_default = COALESCE($5, is_default),
			is_active  = COALESCE($6, is_active),
			priority   = COALESCE($7, priority),
			zone_quota = COALESCE($8, zone_quota),
			updated_at = now()
		 WHERE id = $1
		 RETURNING `+cols,
		id, f.Name, derefOrNil(f.APIToken), f.AccountID, f.IsDefault, f.IsActive, f.Priority, f.ZoneQuota,
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

// SetDefault — mark a config as the kind-default. Unsets any existing
// default of the same kind in one transaction.
func (r *Repo) SetDefault(ctx context.Context, id uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var kind string
	if err := tx.QueryRow(ctx,
		`SELECT kind FROM dns_provider_configs WHERE id = $1`, id,
	).Scan(&kind); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE dns_provider_configs SET is_default = false
		  WHERE kind = $1 AND is_default = true`, kind,
	); err != nil {
		return err
	}
	ct, err := tx.Exec(ctx,
		`UPDATE dns_provider_configs SET is_default = true, updated_at = now()
		  WHERE id = $1`, id,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

// ReorderPriority bulk-applies a new priority list from the admin UI
// drag-and-drop. items is id → new priority. Transactional so partial
// failures don't leave the list in half-reordered state.
func (r *Repo) ReorderPriority(ctx context.Context, items map[uuid.UUID]int) error {
	if len(items) == 0 {
		return nil
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for id, pri := range items {
		if _, err := tx.Exec(ctx,
			`UPDATE dns_provider_configs SET priority = $2, updated_at = now() WHERE id = $1`,
			id, pri,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM dns_provider_configs WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- Health tracking --------------------------------------------------------

// RecordHealth caches the result of a connectivity probe. Called by the admin
// "test connection" handler + the periodic health goroutine (future work).
func (r *Repo) RecordHealth(ctx context.Context, id uuid.UUID, ok bool) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE dns_provider_configs
		   SET last_health_at = now(), last_health_ok = $2, updated_at = now()
		 WHERE id = $1
	`, id, ok)
	return err
}

// SetZonesCount persists the latest zones-in-use count. Called by admin
// endpoint that queries the provider API (or by a periodic sync job).
func (r *Repo) SetZonesCount(ctx context.Context, id uuid.UUID, count int) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE dns_provider_configs
		   SET zones_count = $2, updated_at = now()
		 WHERE id = $1
	`, id, count)
	return err
}

func derefOrNil(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}
