package litera

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Status value untuk DomainRecord.Status.
const (
	DomainStatusRegistered = "registered"
	DomainStatusFailed     = "failed"
)

// DomainRecord — 1 baris litera_domains. Mencatat hostname mana yang sudah
// kita daftarkan ke CORS allowlist Litera.
type DomainRecord struct {
	Hostname     string     `json:"hostname"`
	Status       string     `json:"status"`
	AutoApproved bool       `json:"auto_approved"`
	LastError    string     `json:"last_error"`
	RegisteredAt *time.Time `json:"registered_at"`
	CheckedAt    time.Time  `json:"checked_at"`
}

// DomainRepo — persistensi hostname yang sudah terdaftar di Litera.
type DomainRepo struct {
	pool *pgxpool.Pool
}

func NewDomainRepo(pool *pgxpool.Pool) *DomainRepo { return &DomainRepo{pool: pool} }

const domainCols = `hostname, status, auto_approved, last_error, registered_at, checked_at`

// Get — return (nil, nil) kalau hostname belum pernah dicatat.
func (r *DomainRepo) Get(ctx context.Context, hostname string) (*DomainRecord, error) {
	var d DomainRecord
	err := r.pool.QueryRow(ctx,
		`SELECT `+domainCols+` FROM litera_domains WHERE hostname = $1`,
		NormalizeHost(hostname),
	).Scan(&d.Hostname, &d.Status, &d.AutoApproved, &d.LastError, &d.RegisteredAt, &d.CheckedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// MarkRegistered — hostname berhasil masuk allowlist.
func (r *DomainRepo) MarkRegistered(ctx context.Context, hostname string, autoApproved bool) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO litera_domains (hostname, status, auto_approved, last_error, registered_at, checked_at)
		VALUES ($1, 'registered', $2, '', now(), now())
		ON CONFLICT (hostname) DO UPDATE SET
		    status        = 'registered',
		    auto_approved = EXCLUDED.auto_approved,
		    last_error    = '',
		    registered_at = COALESCE(litera_domains.registered_at, now()),
		    checked_at    = now()
	`, NormalizeHost(hostname), autoApproved)
	return err
}

// MarkFailed — pendaftaran domain gagal. registered_at sengaja tidak di-reset
// supaya jejak keberhasilan sebelumnya tetap terlihat di admin.
func (r *DomainRepo) MarkFailed(ctx context.Context, hostname, msg string) error {
	if len(msg) > 500 {
		msg = msg[:500]
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO litera_domains (hostname, status, last_error, checked_at)
		VALUES ($1, 'failed', $2, now())
		ON CONFLICT (hostname) DO UPDATE SET
		    status     = 'failed',
		    last_error = EXCLUDED.last_error,
		    checked_at = now()
	`, NormalizeHost(hostname), msg)
	return err
}

// Invalidate — paksa pendaftaran ulang pada percobaan berikutnya. Dipanggil
// saat register artikel kena 403: status "registered" kita ternyata basi.
func (r *DomainRepo) Invalidate(ctx context.Context, hostname, reason string) error {
	return r.MarkFailed(ctx, hostname, reason)
}
