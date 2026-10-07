package domains

import (
	"context"
	"errors"
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MaxDomainsPerSite = 1 per konsep produk "1 domain = 1 situs". Dulu 3 (era
// free-subdomain era + custom-domain add), sekarang tiap site diikat ke satu
// hostname yang di-attach saat purchase atau add-custom-domain (mutually
// exclusive di UI). Kalau nanti butuh dukung "alias domain" (mis. .com
// redirect ke .id), bisa naikkan lagi + tambah flag primary.
const MaxDomainsPerSite = 1

type Domain struct {
	ID            uuid.UUID  `json:"id"`
	SiteID        uuid.UUID  `json:"site_id"`
	Hostname      string     `json:"hostname"`
	Status        string     `json:"status"`
	VerifiedAt    *time.Time `json:"verified_at,omitempty"`
	SSLStatus     string     `json:"ssl_status"`
	CertRenewedAt *time.Time `json:"cert_renewed_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")
var ErrTaken = errors.New("hostname taken")
var ErrLimit = errors.New("domain limit reached")

func NormalizeHost(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimSuffix(s, ".")
	return strings.ToLower(s)
}

func ValidHost(s string) bool {
	if s == "" || len(s) > 253 {
		return false
	}
	parts := strings.Split(s, ".")
	if len(parts) < 2 {
		return false
	}
	for _, p := range parts {
		if len(p) == 0 || len(p) > 63 {
			return false
		}
		for _, r := range p {
			if !(r == '-' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z')) {
				return false
			}
		}
		if p[0] == '-' || p[len(p)-1] == '-' {
			return false
		}
	}
	return true
}

func (r *Repo) ListBySite(ctx context.Context, siteID uuid.UUID) ([]Domain, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, site_id, hostname, status, verified_at, ssl_status, cert_renewed_at, created_at
		FROM domains WHERE site_id = $1 ORDER BY created_at DESC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Domain{}
	for rows.Next() {
		var d Domain
		if err := rows.Scan(&d.ID, &d.SiteID, &d.Hostname, &d.Status, &d.VerifiedAt, &d.SSLStatus, &d.CertRenewedAt, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *Repo) CountBySite(ctx context.Context, siteID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM domains WHERE site_id = $1`, siteID).Scan(&n)
	return n, err
}

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, hostname string) (*Domain, error) {
	n, err := r.CountBySite(ctx, siteID)
	if err != nil {
		return nil, err
	}
	if n >= MaxDomainsPerSite {
		return nil, ErrLimit
	}
	var d Domain
	err = r.pool.QueryRow(ctx, `
		INSERT INTO domains (site_id, hostname) VALUES ($1, $2)
		RETURNING id, site_id, hostname, status, verified_at, ssl_status, cert_renewed_at, created_at
	`, siteID, hostname).Scan(&d.ID, &d.SiteID, &d.Hostname, &d.Status, &d.VerifiedAt, &d.SSLStatus, &d.CertRenewedAt, &d.CreatedAt)
	if pgErrCode(err) == "23505" {
		return nil, ErrTaken
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Domain, error) {
	var d Domain
	err := r.pool.QueryRow(ctx, `
		SELECT id, site_id, hostname, status, verified_at, ssl_status, cert_renewed_at, created_at
		FROM domains WHERE id = $1
	`, id).Scan(&d.ID, &d.SiteID, &d.Hostname, &d.Status, &d.VerifiedAt, &d.SSLStatus, &d.CertRenewedAt, &d.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &d, err
}

// IsAllowed — decide apakah Caddy boleh issue TLS cert untuk hostname.
//
// Approve kalau salah satu benar:
//   (a) Custom hostname legacy di `domains` table dengan status=verified.
//       Site status TIDAK dipersyaratkan lagi (dulu wajib published — bikin
//       chicken-egg: visitor pengen lihat draft site harus wait publish).
//   (b) Domain hasil registrasi via wizard di `registered_domains` dengan
//       status=active. Ini flow "beli domain + buat situs" — domain sudah
//       propagate NS ke platform, wajar issue cert bahkan sebelum ada situs.
//
// Cegah abuse: attacker point DNS random ke server kita, coba trigger cert
// issuance. Cert TLS-nya legit tapi tidak resolve ke situs siapapun — cuma
// waste ACME quota. Kalau ini jadi masalah (rate-limit Let's Encrypt), tambah
// per-IP rate limit di endpoint /internal/caddy/ask.
func (r *Repo) IsAllowed(ctx context.Context, hostname string) (bool, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT (
			-- (a) Custom hostname mapping yang sudah verified.
			SELECT count(*) FROM domains
			 WHERE hostname = $1 AND status = 'verified'
		) + (
			-- (b) Domain EPP-registered yang sudah active di registry.
			SELECT count(*) FROM registered_domains
			 WHERE name = $1 AND status = 'active'
		) + (
			-- (c) BYO .id via NS delegation. Drifting still issues certs — the
			-- user may be mid-propagation; suspended/disconnected do not.
			SELECT count(*) FROM site_byo_domains
			 WHERE hostname = $1 AND status IN ('verified','drifting')
		)
	`, hostname).Scan(&n)
	return n > 0, err
}

func (r *Repo) MarkVerified(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE domains SET status = 'verified', verified_at = now() WHERE id = $1`, id)
	return err
}

func (r *Repo) MarkFailed(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE domains SET status = 'failed' WHERE id = $1`, id)
	return err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM domains WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ResolveA returns the IPv4 addresses for hostname.
func ResolveA(ctx context.Context, hostname string) ([]string, error) {
	res := net.Resolver{PreferGo: true}
	ips, err := res.LookupIPAddr(ctx, hostname)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(ips))
	for _, ip := range ips {
		if v4 := ip.IP.To4(); v4 != nil {
			out = append(out, v4.String())
		}
	}
	return out, nil
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
