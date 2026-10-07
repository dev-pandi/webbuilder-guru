package site_byo_domains

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBRow is the full persisted shape of a BYO domain row. Separate from the
// state-machine `Row` which only carries the fields the machine needs.
type DBRow struct {
	ID                   uuid.UUID
	SiteID               uuid.UUID
	UserID               uuid.UUID
	Hostname             string
	Status               State
	DNSZoneID            string     // generic (CF zone id or DNSCloud zone id)
	DNSProvider          string     // 'cloudflare' | 'dnscloud'
	DNSProviderConfigID  *uuid.UUID // sticky — factory MUST use this config for lifecycle ops
	AssignedNS           []string
	ExpiresAt            *time.Time
	LastWhoisAt          *time.Time
	LastHealthAt         *time.Time
	VerifiedAt           *time.Time
	DriftDetectedAt      *time.Time
	SuspendedAt          *time.Time
	DisconnectedAt       *time.Time
	ExpiryNoticeSentAt   *time.Time
	AssignedBy           *uuid.UUID
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// ToMachineRow projects the subset the state machine needs. IsPrimary is
// resolved by the caller (requires joining sites.primary_hostname) — the DB
// row alone can't know.
func (r *DBRow) ToMachineRow(isPrimary bool) Row {
	return Row{
		Status:          r.Status,
		ExpiresAt:       r.ExpiresAt,
		VerifiedAt:      r.VerifiedAt,
		DriftDetectedAt: r.DriftDetectedAt,
		SuspendedAt:     r.SuspendedAt,
		DisconnectedAt:  r.DisconnectedAt,
		IsPrimary:       isPrimary,
	}
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound        = errors.New("byo domain not found")
	ErrHostnameTaken   = errors.New("hostname already connected elsewhere")
	ErrSiteSlotTaken   = errors.New("site already has a byo domain")
)

const cols = `id, site_id, user_id, hostname, status,
    dns_zone_id, dns_provider, dns_provider_config_id, assigned_ns,
    expires_at, last_whois_at, last_health_at, verified_at,
    drift_detected_at, suspended_at, disconnected_at,
    expiry_notice_sent_at, assigned_by, created_at, updated_at`

func scan(row pgx.Row, r *DBRow) error {
	return row.Scan(
		&r.ID, &r.SiteID, &r.UserID, &r.Hostname, &r.Status,
		&r.DNSZoneID, &r.DNSProvider, &r.DNSProviderConfigID, &r.AssignedNS,
		&r.ExpiresAt, &r.LastWhoisAt, &r.LastHealthAt, &r.VerifiedAt,
		&r.DriftDetectedAt, &r.SuspendedAt, &r.DisconnectedAt,
		&r.ExpiryNoticeSentAt, &r.AssignedBy, &r.CreatedAt, &r.UpdatedAt,
	)
}

// CreateInput is what the /connect handler passes in after calling the DNS
// provider and validating hostname. DNSProvider + DNSProviderConfigID are
// required for new rows — factory resolves them before this call.
type CreateInput struct {
	SiteID              uuid.UUID
	UserID              uuid.UUID
	Hostname            string
	DNSZoneID           string
	DNSProvider         string
	DNSProviderConfigID *uuid.UUID
	AssignedNS          []string
	ExpiresAt           *time.Time
	AssignedBy          *uuid.UUID
}

func (r *Repo) Create(ctx context.Context, in CreateInput) (*DBRow, error) {
	provider := in.DNSProvider
	if provider == "" {
		provider = "cloudflare" // back-compat for pre-Step 6 callers
	}
	var out DBRow
	err := scan(r.pool.QueryRow(ctx, `
		INSERT INTO site_byo_domains
		(site_id, user_id, hostname, status, dns_zone_id, dns_provider, dns_provider_config_id,
		 assigned_ns, expires_at, last_whois_at, assigned_by)
		VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,now(),$9)
		RETURNING `+cols,
		in.SiteID, in.UserID, in.Hostname,
		in.DNSZoneID, provider, in.DNSProviderConfigID, in.AssignedNS,
		in.ExpiresAt, in.AssignedBy,
	), &out)
	if err != nil {
		switch pgErrCode(err) {
		case "23505":
			// Could be either ux_site_byo_domains_hostname or
			// ux_site_byo_domains_site — surface the semantically correct one.
			if existing, _ := r.GetByHostname(ctx, in.Hostname); existing != nil {
				return nil, ErrHostnameTaken
			}
			return nil, ErrSiteSlotTaken
		}
		return nil, err
	}
	return &out, nil
}

func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*DBRow, error) {
	var out DBRow
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM site_byo_domains WHERE id = $1`, id), &out)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &out, err
}

func (r *Repo) GetBySite(ctx context.Context, siteID uuid.UUID) (*DBRow, error) {
	var out DBRow
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM site_byo_domains WHERE site_id = $1`, siteID), &out)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &out, err
}

func (r *Repo) GetByHostname(ctx context.Context, hostname string) (*DBRow, error) {
	var out DBRow
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM site_byo_domains WHERE hostname = $1`, hostname), &out)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &out, err
}

// MarkVerified flips pending → verified atomically. Fails if row is not in
// pending state (caller re-fetches and surfaces the conflict).
func (r *Repo) MarkVerified(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status = 'verified', verified_at = now(), updated_at = now()
		 WHERE id = $1 AND status = 'pending'
	`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkHealthResult updates last_health_at and transitions status based on
// what the state machine decided. Caller passes the computed next state.
func (r *Repo) MarkHealthResult(ctx context.Context, id uuid.UUID, next State, driftDetectedAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status            = $2,
		       last_health_at    = now(),
		       drift_detected_at = COALESCE($3, drift_detected_at),
		       updated_at        = now()
		 WHERE id = $1
	`, id, string(next), driftDetectedAt)
	return err
}

// ClearDrift resets drift timers on recovery.
func (r *Repo) ClearDrift(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status            = 'verified',
		       drift_detected_at = NULL,
		       suspended_at      = NULL,
		       disconnected_at   = NULL,
		       last_health_at    = now(),
		       updated_at        = now()
		 WHERE id = $1
	`, id)
	return err
}

// MarkSuspended transitions drifting → suspended.
func (r *Repo) MarkSuspended(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status = 'suspended', suspended_at = now(), updated_at = now()
		 WHERE id = $1 AND status = 'drifting'
	`, id)
	return err
}

// MarkDisconnected transitions suspended → disconnected.
func (r *Repo) MarkDisconnected(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status = 'disconnected', disconnected_at = now(), updated_at = now()
		 WHERE id = $1 AND status = 'suspended'
	`, id)
	return err
}

// MarkExpired transitions any → expired after WHOIS confirms past expiry.
func (r *Repo) MarkExpired(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status = 'expired', updated_at = now()
		 WHERE id = $1 AND status <> 'expired'
	`, id)
	return err
}

// Reactivate flips expired → verified when WHOIS shows renewal. Does NOT
// touch sites.primary_hostname — explicit user action required.
func (r *Repo) Reactivate(ctx context.Context, id uuid.UUID, newExpiresAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET status        = 'verified',
		       expires_at    = $2,
		       last_whois_at = now(),
		       updated_at    = now()
		 WHERE id = $1 AND status = 'expired'
	`, id, newExpiresAt)
	return err
}

// UpdateWhois caches a fresh WHOIS probe. Called by the daily reconciler.
func (r *Repo) UpdateWhois(ctx context.Context, id uuid.UUID, expiresAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET expires_at    = $2,
		       last_whois_at = now(),
		       updated_at    = now()
		 WHERE id = $1
	`, id, expiresAt)
	return err
}

// MarkExpiryNoticeSent dedupes outbound expiry warning emails.
func (r *Repo) MarkExpiryNoticeSent(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE site_byo_domains
		   SET expiry_notice_sent_at = now(), updated_at = now()
		 WHERE id = $1
	`, id)
	return err
}

// Delete hard-deletes the row. Caller must have already deleted the CF zone
// (or scheduled it for the orphan reconciler).
func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM site_byo_domains WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListDueForHealthCheck returns rows that haven't been health-checked in the
// last `interval`. Ordered by last_health_at ASC NULLS FIRST so brand-new
// rows get picked up on the next tick.
func (r *Repo) ListDueForHealthCheck(ctx context.Context, interval time.Duration, limit int) ([]DBRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+` FROM site_byo_domains
		 WHERE status IN ('pending','verified','drifting','suspended')
		   AND (last_health_at IS NULL OR last_health_at < now() - $1::interval)
		 ORDER BY last_health_at ASC NULLS FIRST
		 LIMIT $2
	`, interval.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DBRow{}
	for rows.Next() {
		var d DBRow
		if err := scan(rows, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListDueForWhoisCheck returns rows whose WHOIS cache is stale. Active rows
// get rechecked daily; rows expiring soon get rechecked hourly (caller passes
// a shorter interval for the hot batch).
func (r *Repo) ListDueForWhoisCheck(ctx context.Context, interval time.Duration, limit int) ([]DBRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+` FROM site_byo_domains
		 WHERE status IN ('verified','drifting','suspended','expired')
		   AND (last_whois_at IS NULL OR last_whois_at < now() - $1::interval)
		 ORDER BY last_whois_at ASC NULLS FIRST
		 LIMIT $2
	`, interval.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DBRow{}
	for rows.Next() {
		var d DBRow
		if err := scan(rows, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListExpiredCleanupCandidates — expired rows past the 90-day cleanup grace.
func (r *Repo) ListExpiredCleanupCandidates(ctx context.Context, grace time.Duration, limit int) ([]DBRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+cols+` FROM site_byo_domains
		 WHERE status = 'expired'
		   AND expires_at IS NOT NULL
		   AND expires_at < now() - $1::interval
		 ORDER BY expires_at ASC
		 LIMIT $2
	`, grace.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DBRow{}
	for rows.Next() {
		var d DBRow
		if err := scan(rows, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// AllHostnamesForCaddyAsk — flat list of hostnames eligible for TLS issuance
// (status verified/drifting). The /internal/caddy/ask handler unions this
// with the existing registered_domains + domains queries.
func (r *Repo) AllHostnamesForCaddyAsk(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT hostname FROM site_byo_domains
		 WHERE status IN ('verified','drifting')
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
