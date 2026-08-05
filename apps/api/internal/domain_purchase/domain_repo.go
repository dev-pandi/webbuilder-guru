// domain_repo.go — current-state per-domain aggregate (tabel `domains`).
// Terpisah dari domain_purchases yang jadi transaction log.
//
// Design invariants:
//   - 1 row per FQDN (UNIQUE constraint di name).
//   - Upsert idempotent: register ulang domain yg sama (idempotency via api-registry)
//     tidak duplicate — cukup update timestamps.
//   - Renew NO create new row — cuma UPDATE expires_at + last_renewed_at.

package domain_purchase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Domain — 1 baris tabel `domains`. Bukan purchase — ini aggregate state.
type Domain struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	PurchasedBy     *uuid.UUID
	Name            string
	ContactID       string
	ExpiresAt       *time.Time
	RegisteredAt    time.Time
	LastRenewedAt   *time.Time
	Status          string
	SiteID          *uuid.UUID
	RegistrarJobID  string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

const domainCols = `id, user_id, purchased_by, name, contact_id, expires_at,
	registered_at, last_renewed_at, status, site_id, registrar_job_id,
	created_at, updated_at`

func scanDomain(row pgx.Row, d *Domain) error {
	return row.Scan(
		&d.ID, &d.UserID, &d.PurchasedBy, &d.Name, &d.ContactID, &d.ExpiresAt,
		&d.RegisteredAt, &d.LastRenewedAt, &d.Status, &d.SiteID, &d.RegistrarJobID,
		&d.CreatedAt, &d.UpdatedAt,
	)
}

// UpsertDomain — dipanggil executeRegister setelah EPP CREATE sukses. Idempotent:
// register ulang domain yang sama (api-registry idempotent by identity) →
// UPDATE existing row.
func (r *Repo) UpsertDomain(ctx context.Context, d Domain) (*Domain, error) {
	q := `
		INSERT INTO registered_domains (
			user_id, purchased_by, name, contact_id, expires_at,
			registered_at, status, site_id, registrar_job_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (name) DO UPDATE SET
			user_id          = EXCLUDED.user_id,
			purchased_by     = EXCLUDED.purchased_by,
			contact_id       = COALESCE(NULLIF(EXCLUDED.contact_id, ''), registered_domains.contact_id),
			expires_at       = COALESCE(EXCLUDED.expires_at, registered_domains.expires_at),
			status           = EXCLUDED.status,
			registrar_job_id = COALESCE(NULLIF(EXCLUDED.registrar_job_id, ''), registered_domains.registrar_job_id),
			updated_at       = now()
		RETURNING ` + domainCols
	registeredAt := d.RegisteredAt
	if registeredAt.IsZero() {
		registeredAt = time.Now()
	}
	status := d.Status
	if status == "" {
		status = "active"
	}
	var out Domain
	if err := scanDomain(
		r.pool.QueryRow(ctx, q,
			d.UserID, d.PurchasedBy, d.Name, d.ContactID, d.ExpiresAt,
			registeredAt, status, d.SiteID, d.RegistrarJobID,
		), &out,
	); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpdateDomainExpiry — dipanggil executeRenew setelah EPP RENEW sukses.
// Tidak bikin row baru — cuma extend expires_at + record last_renewed_at.
func (r *Repo) UpdateDomainExpiry(ctx context.Context, name string, expiresAt time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE registered_domains SET
			expires_at      = $2,
			last_renewed_at = now(),
			updated_at      = now()
		 WHERE name = $1
	`, name, expiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetDomainContact — dipanggil kalau user update WHOIS contact via portal.
func (r *Repo) SetDomainContact(ctx context.Context, name, contactID string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE registered_domains SET contact_id = $2, updated_at = now() WHERE name = $1
	`, name, contactID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetDomainByName — ownership-scoped fetch (inclusive purchased_by).
// Return ErrNotFound kalau caller bukan owner (user_id) DAN bukan purchaser
// (purchased_by via on-behalf-of).
func (r *Repo) GetDomainByName(ctx context.Context, name string, userID uuid.UUID) (*Domain, error) {
	q := `SELECT ` + domainCols + `
		FROM registered_domains
		WHERE name = $1 AND (user_id = $2 OR purchased_by = $2)`
	var d Domain
	if err := scanDomain(r.pool.QueryRow(ctx, q, name, userID), &d); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

// GetDomainByNameAdmin — bypass ownership. Dipakai admin detail page yang
// perlu troubleshoot domain lintas user (mis. "domain user X tidak accessible").
func (r *Repo) GetDomainByNameAdmin(ctx context.Context, name string) (*Domain, error) {
	q := `SELECT ` + domainCols + ` FROM registered_domains WHERE name = $1`
	var d Domain
	if err := scanDomain(r.pool.QueryRow(ctx, q, name), &d); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

// ListDomainsByUser — semua domain yang caller "manage": jadi `user_id`
// (self-purchase / owner) ATAU `purchased_by` (agent/reseller yang trigger
// register on-behalf-of). Agent yang beli untuk klien tetap kelihatan di
// list-nya sendiri walau klien yang jadi owner formal.
func (r *Repo) ListDomainsByUser(ctx context.Context, userID uuid.UUID) ([]Domain, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+domainCols+`
		FROM registered_domains
		WHERE user_id = $1 OR purchased_by = $1
		ORDER BY expires_at ASC NULLS LAST, name ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Domain{}
	for rows.Next() {
		var d Domain
		if err := scanDomain(rows, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListDomainsByUsers — bulk untuk reseller/agent team scope. Include semua
// domain yang user_id ATAU purchased_by nya di list (untuk cover team's
// on-behalf-of). Dipakai /reseller/domains + /agent/domains.
func (r *Repo) ListDomainsByUsers(ctx context.Context, userIDs []uuid.UUID) ([]Domain, error) {
	if len(userIDs) == 0 {
		return []Domain{}, nil
	}
	rows, err := r.pool.Query(ctx, `SELECT `+domainCols+`
		FROM registered_domains
		WHERE user_id = ANY($1) OR purchased_by = ANY($1)
		ORDER BY expires_at ASC NULLS LAST, name ASC`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Domain{}
	for rows.Next() {
		var d Domain
		if err := scanDomain(rows, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// AdminDomain — 1 row untuk admin observability. Include owner info dari
// join users supaya UI tidak perlu second-fetch.
type AdminDomain struct {
	Domain
	OwnerEmail string
	OwnerName  string
}

// AdminDomainFilter — filter query untuk admin aggregate list.
type AdminDomainFilter struct {
	Q            string // search di name atau owner email
	Status       string // "" = semua
	ExpiringDays int    // > 0 → active + expires_at ≤ now + N days
	Page         int
	PageSize     int
}

// AdminListDomains — paginated + filter, join users. Dipakai halaman
// /admin/domain untuk observability semua domain lintas user.
func (r *Repo) AdminListDomains(ctx context.Context, f AdminDomainFilter) ([]AdminDomain, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize <= 0 || f.PageSize > 200 {
		f.PageSize = 30
	}

	where := "WHERE 1=1"
	args := []any{}
	if f.Status != "" {
		args = append(args, f.Status)
		where += fmt.Sprintf(" AND rd.status = $%d", len(args))
	}
	if f.ExpiringDays > 0 {
		args = append(args, f.ExpiringDays)
		where += " AND rd.status = 'active' AND rd.expires_at IS NOT NULL"
		where += fmt.Sprintf(" AND rd.expires_at <= now() + ($%d || ' days')::interval", len(args))
	}
	if f.Q != "" {
		args = append(args, "%"+f.Q+"%")
		where += fmt.Sprintf(" AND (rd.name ILIKE $%d OR u.email ILIKE $%d OR u.name ILIKE $%d)",
			len(args), len(args), len(args))
	}

	var total int
	countQ := `SELECT COUNT(*) FROM registered_domains rd
		LEFT JOIN users u ON u.id = rd.user_id ` + where
	if err := r.pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (f.Page - 1) * f.PageSize
	args = append(args, f.PageSize, offset)
	q := `SELECT
			rd.id, rd.user_id, rd.purchased_by, rd.name, rd.contact_id, rd.expires_at,
			rd.registered_at, rd.last_renewed_at, rd.status, rd.site_id, rd.registrar_job_id,
			rd.created_at, rd.updated_at,
			COALESCE(u.email, ''), COALESCE(u.name, '')
		FROM registered_domains rd
		LEFT JOIN users u ON u.id = rd.user_id ` + where + `
		ORDER BY rd.expires_at ASC NULLS LAST, rd.name ASC
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []AdminDomain{}
	for rows.Next() {
		var a AdminDomain
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.PurchasedBy, &a.Name, &a.ContactID, &a.ExpiresAt,
			&a.RegisteredAt, &a.LastRenewedAt, &a.Status, &a.SiteID, &a.RegistrarJobID,
			&a.CreatedAt, &a.UpdatedAt,
			&a.OwnerEmail, &a.OwnerName,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

// AttachDomainSite — link domain ke sites row.
func (r *Repo) AttachDomainSite(ctx context.Context, name string, userID, siteID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE registered_domains SET site_id = $3, updated_at = now()
		 WHERE name = $1 AND user_id = $2
	`, name, userID, siteID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
