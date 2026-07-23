// Package domain_purchase menyimpan tracker beli-domain lokal + repo untuk
// query by user/job. Source of truth status tetap di registrar-api; kolom
// `status` di sini adalah cache dari webhook update.
package domain_purchase

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Purchase merepresentasikan satu attempt beli domain. `SiteID` bisa nil —
// diisi setelah user create situs yang di-attach ke domain ini.
//
// Kind = "register" atau "renew". Renew jobs tidak pernah di-attach ke site
// (site sudah exist dari register sebelumnya) — SiteID selalu nil.
type Purchase struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	SiteID         *uuid.UUID
	RegistrarJobID string
	Domain         string
	Years          int
	Kind           string // "register" | "renew"
	Status         string
	Reason         string
	PaymentMethod  string
	PaymentURL     string
	ExpiresAt      *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Kind constants — mirror registrar_domain_jobs.kind.
const (
	KindRegister = "register"
	KindRenew    = "renew"
)

// Status constants — mirror registrar-api models.JobStatus*.
const (
	StatusPendingPayment      = "pending_payment"
	StatusPendingDocument     = "pending_document"
	StatusPendingProvisioning = "pending_provisioning"
	StatusActive              = "active"
	StatusFailed              = "failed"
	StatusExpired             = "expired"
)

// IsTerminal reports whether status won't change again (frontend can stop polling).
func IsTerminal(status string) bool {
	return status == StatusActive || status == StatusFailed || status == StatusExpired
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound = errors.New("domain purchase not found")
	ErrJobTaken = errors.New("registrar_job_id already exists")
)

const cols = `id, user_id, site_id, registrar_job_id, domain, years, kind, status, reason, payment_method, payment_url, expires_at, created_at, updated_at`

func scan(row pgx.Row, p *Purchase) error {
	return row.Scan(
		&p.ID, &p.UserID, &p.SiteID, &p.RegistrarJobID, &p.Domain, &p.Years, &p.Kind,
		&p.Status, &p.Reason, &p.PaymentMethod, &p.PaymentURL,
		&p.ExpiresAt, &p.CreatedAt, &p.UpdatedAt,
	)
}

// Create inserts a new pending purchase. Called setelah panggilan sukses ke
// registrar-api `/domain/register` — kita simpan job_id + payment_url + status
// awal supaya frontend bisa polling tanpa hit registrar lagi.
func (r *Repo) Create(ctx context.Context, p *Purchase) error {
	if p.Kind == "" {
		p.Kind = KindRegister
	}
	err := r.pool.QueryRow(ctx, `
		INSERT INTO domain_purchases
		(user_id, site_id, registrar_job_id, domain, years, kind, status, reason, payment_method, payment_url, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING `+cols,
		p.UserID, p.SiteID, p.RegistrarJobID, p.Domain, p.Years, p.Kind,
		p.Status, p.Reason, p.PaymentMethod, p.PaymentURL, p.ExpiresAt,
	).Scan(
		&p.ID, &p.UserID, &p.SiteID, &p.RegistrarJobID, &p.Domain, &p.Years, &p.Kind,
		&p.Status, &p.Reason, &p.PaymentMethod, &p.PaymentURL,
		&p.ExpiresAt, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return ErrJobTaken
		}
	}
	return err
}

// GetByJobID lookup + ownership check. Selalu filter by user_id supaya user A
// tidak bisa polling job user B (URL guessing defence).
func (r *Repo) GetByJobID(ctx context.Context, jobID string, userID uuid.UUID) (*Purchase, error) {
	var p Purchase
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM domain_purchases WHERE registrar_job_id = $1 AND user_id = $2`,
		jobID, userID,
	), &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// GetLatestActiveByDomain cari purchase yang statusnya active + kind=register
// untuk domain tertentu, scoped ke user. Dipakai Renew handler untuk verify
// bahwa user memang pemilik domain sebelum forward renew request ke registrar.
// Renew job sendiri di-exclude (kind != 'register') supaya bisa multiple renew
// per domain.
func (r *Repo) GetLatestActiveByDomain(ctx context.Context, domain string, userID uuid.UUID) (*Purchase, error) {
	var p Purchase
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM domain_purchases
		  WHERE user_id = $1 AND domain = $2 AND kind = 'register' AND status = 'active'
		  ORDER BY created_at DESC LIMIT 1`,
		userID, domain,
	), &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// GetByJobIDAny lookup TANPA ownership check — dipakai HANYA oleh webhook
// receiver (yang sudah authenticated via HMAC secret, bukan user JWT).
func (r *Repo) GetByJobIDAny(ctx context.Context, jobID string) (*Purchase, error) {
	var p Purchase
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM domain_purchases WHERE registrar_job_id = $1`,
		jobID,
	), &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// ListByUser — buat halaman "Domain saya" (kalau nanti diperlukan).
func (r *Repo) ListByUser(ctx context.Context, userID uuid.UUID, limit int) ([]Purchase, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+cols+` FROM domain_purchases WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Purchase
	for rows.Next() {
		var p Purchase
		if err := scan(rows, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpdateStatus dari webhook / poll. Idempoten — kalau status baru sama, no-op.
// Kembalikan flag `changed` supaya caller tahu perlu trigger side-effect
// (misal create sites row saat pertama kali jadi 'active').
func (r *Repo) UpdateStatus(ctx context.Context, jobID, status, reason string, expiresAt *time.Time) (changed bool, err error) {
	ct, err := r.pool.Exec(ctx, `
		UPDATE domain_purchases
		   SET status = $2,
		       reason = $3,
		       expires_at = COALESCE($4, expires_at),
		       updated_at = now()
		 WHERE registrar_job_id = $1 AND status <> $2`,
		jobID, status, reason, expiresAt,
	)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() > 0, nil
}

// AttachSite dipanggil sekali oleh handler "Buat Situs" saat user pilih
// template + slug untuk domain yang statusnya active. site_id NULL berarti
// user belum lanjut ke step create situs.
func (r *Repo) AttachSite(ctx context.Context, jobID string, userID, siteID uuid.UUID) error {
	ct, err := r.pool.Exec(ctx,
		`UPDATE domain_purchases SET site_id = $1, updated_at = now()
		   WHERE registrar_job_id = $2 AND user_id = $3 AND site_id IS NULL`,
		siteID, jobID, userID,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdatePaymentURL dipanggil oleh webhook / poll saat registrar-api sudah
// generate URL Midtrans/Paylabs (biasanya second update setelah register).
func (r *Repo) UpdatePaymentURL(ctx context.Context, jobID, paymentURL string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE domain_purchases SET payment_url = $1, updated_at = now()
		   WHERE registrar_job_id = $2 AND payment_url = ''`,
		paymentURL, jobID,
	)
	return err
}

// ExpiryDue = row yang eligible untuk email peringatan. Terpisah dari Purchase
// karena kita cuma butuh subset field + user email untuk kirim email.
type ExpiryDue struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Email     string
	Name      string
	Domain    string
	ExpiresAt time.Time
}

// ListDueForExpiryNotice cari domain aktif yang expire ≤ `within` dari sekarang,
// dan (belum pernah di-notify ATAU last notice ≥ `resendAfter` yang lalu).
//
// Per (user_id, domain) hanya ambil row expires_at TERBARU — supaya user tidak
// dapat 2 email untuk domain yang sama (misal karena ada row register + renew).
// Renewal yang bikin expires_at maju otomatis pindah "target" ke row baru.
//
// Skip row yang sudah expire (expires_at < now) — sekali domain expire, tidak
// ada gunanya kirim peringatan; user perlu action lain (re-register).
func (r *Repo) ListDueForExpiryNotice(ctx context.Context, within, resendAfter time.Duration) ([]ExpiryDue, error) {
	// make_interval(hours => N) — native + tidak perlu string-parse Go duration
	// yang formatnya beda dgn Postgres INTERVAL syntax.
	withinHours := int(within / time.Hour)
	resendHours := int(resendAfter / time.Hour)
	rows, err := r.pool.Query(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON (dp.user_id, dp.domain)
			       dp.id, dp.user_id, dp.domain, dp.expires_at, dp.expiry_notice_sent_at
			  FROM domain_purchases dp
			 WHERE dp.status = 'active'
			   AND dp.expires_at IS NOT NULL
			 ORDER BY dp.user_id, dp.domain, dp.expires_at DESC
		)
		SELECT latest.id, latest.user_id, u.email, u.name, latest.domain, latest.expires_at
		  FROM latest
		  JOIN users u ON u.id = latest.user_id
		 WHERE latest.expires_at > now()
		   AND latest.expires_at <= now() + make_interval(hours => $1)
		   AND (latest.expiry_notice_sent_at IS NULL
		        OR latest.expiry_notice_sent_at < now() - make_interval(hours => $2))
	`, withinHours, resendHours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExpiryDue
	for rows.Next() {
		var d ExpiryDue
		if err := rows.Scan(&d.ID, &d.UserID, &d.Email, &d.Name, &d.Domain, &d.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// MarkExpiryNoticeSent update timestamp supaya row tidak di-notify lagi
// sampai `resendAfter` window berlalu.
func (r *Repo) MarkExpiryNoticeSent(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE domain_purchases SET expiry_notice_sent_at = now() WHERE id = $1`,
		id,
	)
	return err
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
