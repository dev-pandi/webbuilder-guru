// Package domain_purchase menyimpan tracker beli-domain lokal + repo untuk
// query by user/job. Source of truth status tetap di registrar-api; kolom
// `status` di sini adalah cache dari webhook update.
package domain_purchase

import (
	"context"
	"errors"
	"strings"
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
	UserID         uuid.UUID // owner domain (client kalau on-behalf-of)
	// PurchasedBy = actor yang trigger register/renew (reseller atau agent).
	// nil = self-purchase (client beli sendiri, back-compat rows lama).
	PurchasedBy    *uuid.UUID
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
	// Cancelled = user batalkan checkout sebelum bayar (mis. close payment
	// gateway tab), atau job di-cancel oleh admin. Terminal state — beda
	// dari failed (yang implicit "sistem gagal") vs cancelled ("user
	// pilihan"), supaya UI bisa kasih copy yang sesuai.
	StatusCancelled = "cancelled"
)

// IsTerminal reports whether status won't change again (frontend can stop polling).
func IsTerminal(status string) bool {
	return status == StatusActive ||
		status == StatusFailed ||
		status == StatusExpired ||
		status == StatusCancelled
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound = errors.New("domain purchase not found")
	ErrJobTaken = errors.New("registrar_job_id already exists")
)

const cols = `id, user_id, purchased_by, site_id, registrar_job_id, domain, years, kind, status, reason, payment_method, payment_url, expires_at, created_at, updated_at`

func scan(row pgx.Row, p *Purchase) error {
	return row.Scan(
		&p.ID, &p.UserID, &p.PurchasedBy, &p.SiteID, &p.RegistrarJobID, &p.Domain, &p.Years, &p.Kind,
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
		(user_id, purchased_by, site_id, registrar_job_id, domain, years, kind, status, reason, payment_method, payment_url, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING `+cols,
		p.UserID, p.PurchasedBy, p.SiteID, p.RegistrarJobID, p.Domain, p.Years, p.Kind,
		p.Status, p.Reason, p.PaymentMethod, p.PaymentURL, p.ExpiresAt,
	).Scan(
		&p.ID, &p.UserID, &p.PurchasedBy, &p.SiteID, &p.RegistrarJobID, &p.Domain, &p.Years, &p.Kind,
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

// GetByJobIDForActor — lookup dengan ownership yang inklusif ke actor.
// Boleh diakses kalau callerID adalah owner (user_id) ATAU purchaser
// (purchased_by). Dipakai flow on-behalf-of: reseller/agent yang beli untuk
// client tetap boleh poll status + upload dokumen.
func (r *Repo) GetByJobIDForActor(ctx context.Context, jobID string, callerID uuid.UUID) (*Purchase, error) {
	var p Purchase
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM domain_purchases
		  WHERE registrar_job_id = $1 AND (user_id = $2 OR purchased_by = $2)`,
		jobID, callerID,
	), &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// ResellerStats — aggregate untuk dashboard reseller (Phase 6). Semua field
// scoped ke domain yang di-purchase-by resellerID + agent-agent di bawahnya.
type ResellerStats struct {
	ActiveDomains  int64 // status='active' & kind='register' (unique domain)
	Expiring30Days int64 // active & expires_at ≤ now+30d
	Expiring90Days int64 // active & expires_at ≤ now+90d (superset of 30d)
	PendingJobs    int64 // any non-terminal (pending_payment / provisioning / dst.)
}

// GetResellerStats — hitung aggregate dari domain_purchases where
// purchased_by IN (reseller + agents). Caller resolve agent list dulu supaya
// query sederhana. Untuk MVP, hanya butuh purchased_by IN ($set).
func (r *Repo) GetResellerStats(ctx context.Context, actorIDs []uuid.UUID) (*ResellerStats, error) {
	if len(actorIDs) == 0 {
		return &ResellerStats{}, nil
	}
	var s ResellerStats
	// Single query, banyak count via FILTER (Postgres) supaya cukup 1 round-trip.
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'active' AND kind = 'register')                        AS active_domains,
			COUNT(*) FILTER (WHERE status = 'active' AND expires_at IS NOT NULL
			                      AND expires_at <= now() + interval '30 days')                    AS expiring_30d,
			COUNT(*) FILTER (WHERE status = 'active' AND expires_at IS NOT NULL
			                      AND expires_at <= now() + interval '90 days')                    AS expiring_90d,
			COUNT(*) FILTER (WHERE status IN ('pending_payment','pending_document','pending_provisioning')) AS pending_jobs
		  FROM domain_purchases
		 WHERE purchased_by = ANY($1)
	`, actorIDs).Scan(&s.ActiveDomains, &s.Expiring30Days, &s.Expiring90Days, &s.PendingJobs)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ListByPurchasers — semua purchase yang di-trigger oleh salah satu actor
// dalam set (reseller + agent-agentnya). Dipakai admin detail page untuk
// lihat portfolio domain 1 reseller. Berbeda dari ListByPurchaser: TIDAK
// exclude self-purchase karena admin butuh gambaran full.
func (r *Repo) ListByPurchasers(ctx context.Context, actorIDs []uuid.UUID, limit int) ([]Purchase, error) {
	if len(actorIDs) == 0 {
		return []Purchase{}, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+cols+` FROM domain_purchases
		  WHERE purchased_by = ANY($1)
		  ORDER BY created_at DESC LIMIT $2`,
		actorIDs, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Purchase{}
	for rows.Next() {
		var p Purchase
		if err := scan(rows, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListByPurchaser — semua purchase yang di-trigger oleh caller ini (reseller/
// agent). Terpisah dari ListByUser supaya dashboard reseller bisa lihat
// portfolio klien tanpa mixed dengan self-owned domain.
func (r *Repo) ListByPurchaser(ctx context.Context, purchaserID uuid.UUID, limit int) ([]Purchase, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+cols+` FROM domain_purchases
		  WHERE purchased_by = $1 AND user_id <> $1
		  ORDER BY created_at DESC LIMIT $2`,
		purchaserID, limit,
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

// GetLatestActiveByDomain cari purchase yang statusnya active + kind=register
// untuk domain tertentu, scoped ke user (SEBAGAI owner ATAU purchaser).
// Dipakai Renew + WHOIS + Nameserver handler untuk verify bahwa caller
// memang berhak manage domain ini sebelum forward request ke registrar.
//
// Ownership dua-jalur:
//   - `user_id = $1` → self-purchase (client role atau reseller/agent yang
//     beli untuk diri sendiri).
//   - `purchased_by = $1` → on-behalf-of. Reseller/agent yang beli untuk
//     client tetap boleh manage NS + WHOIS + renew (dia yang trigger + bayar).
//
// Renew job sendiri di-exclude (kind != 'register') supaya bisa multiple
// renew per domain tanpa duplicate result.
func (r *Repo) GetLatestActiveByDomain(ctx context.Context, domain string, userID uuid.UUID) (*Purchase, error) {
	var p Purchase
	err := scan(r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM domain_purchases
		  WHERE (user_id = $1 OR purchased_by = $1)
		    AND domain = $2 AND kind = 'register' AND status = 'active'
		  ORDER BY created_at DESC LIMIT 1`,
		userID, domain,
	), &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// ActiveDomainForSite return nama domain aktif yang ter-attach ke site.
// Dipakai cache-purge post-publish untuk resolve URL yang perlu di-invalidate.
// Return "" (bukan error) kalau site belum ada domain — caller bisa skip
// purge tanpa alarm. `kind='register'` filter penting: renew job tidak
// nambah entity domain, cuma extend expiry.
func (r *Repo) ActiveDomainForSite(ctx context.Context, siteID uuid.UUID) (string, error) {
	var domain string
	err := r.pool.QueryRow(ctx, `
		SELECT domain FROM domain_purchases
		 WHERE site_id = $1 AND kind = 'register' AND status = 'active'
		 ORDER BY created_at DESC LIMIT 1
	`, siteID).Scan(&domain)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return domain, err
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

// AdminPurchase = row untuk admin observability. Join dengan users supaya
// tabel admin bisa tampil email + nama tanpa lookup terpisah per row.
type AdminPurchase struct {
	Purchase
	UserEmail string
	UserName  string
}

// AdminListFilter — filter query untuk admin purchases list.
type AdminListFilter struct {
	Status string // exact match ("" = semua)
	Kind   string // exact match ("" = semua)
	Like   string // LIKE pattern (dari httpx.LikePattern) — match domain OR user email
	Sort   string // whitelist di orderSQL, default "created_at DESC"
	Limit  int
	Offset int
}

// orderAdminPurchasesSQL whitelist untuk sort preset. JANGAN interpolasi
// user input mentah — bahaya SQL injection.
func orderAdminPurchasesSQL(preset string) string {
	switch preset {
	case "domain_asc":
		return "dp.domain ASC, dp.created_at DESC"
	case "domain_desc":
		return "dp.domain DESC, dp.created_at DESC"
	case "expires_soon":
		// NULLs last supaya baris yang belum ada expiry tidak dominate.
		return "dp.expires_at ASC NULLS LAST, dp.created_at DESC"
	case "created_asc":
		return "dp.created_at ASC"
	default:
		return "dp.created_at DESC"
	}
}

// AdminList — paginated + filter, join users. Dipakai halaman
// /admin/registrar/purchases untuk ops trace pembelian bermasalah.
func (r *Repo) AdminList(ctx context.Context, f AdminListFilter) ([]AdminPurchase, int, error) {
	where := []string{"1=1"}
	args := []any{}
	i := 1
	if f.Status != "" {
		where = append(where, "dp.status = $"+itoaPos(i))
		args = append(args, f.Status)
		i++
	}
	if f.Kind != "" {
		where = append(where, "dp.kind = $"+itoaPos(i))
		args = append(args, f.Kind)
		i++
	}
	if f.Like != "" && f.Like != "%%" {
		// Search domain ATAU user email — 1 argument (pattern) dipakai dua kali.
		where = append(where,
			"(LOWER(dp.domain) LIKE $"+itoaPos(i)+" OR LOWER(u.email) LIKE $"+itoaPos(i)+")")
		args = append(args, f.Like)
		i++
	}

	whereSQL := strings.Join(where, " AND ")
	orderSQL := orderAdminPurchasesSQL(f.Sort)

	// Count query dulu supaya total accurate walaupun page kosong.
	var total int
	if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM domain_purchases dp JOIN users u ON u.id = dp.user_id WHERE "+whereSQL,
		args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Data query — pagination arg terakhir supaya index-nya predictable.
	dataArgs := append(append([]any{}, args...), f.Limit, f.Offset)
	rows, err := r.pool.Query(ctx, `
		SELECT `+prefixedCols("dp")+`, u.email, u.name
		  FROM domain_purchases dp
		  JOIN users u ON u.id = dp.user_id
		 WHERE `+whereSQL+`
		 ORDER BY `+orderSQL+`
		 LIMIT $`+itoaPos(i)+` OFFSET $`+itoaPos(i+1),
		dataArgs...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []AdminPurchase
	for rows.Next() {
		var a AdminPurchase
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.PurchasedBy, &a.SiteID, &a.RegistrarJobID, &a.Domain, &a.Years, &a.Kind,
			&a.Status, &a.Reason, &a.PaymentMethod, &a.PaymentURL,
			&a.ExpiresAt, &a.CreatedAt, &a.UpdatedAt,
			&a.UserEmail, &a.UserName,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

// prefixedCols = `cols` versi dengan alias table. `cols` di file lain tanpa
// prefix — kita perlu prefix di query JOIN supaya tidak ambiguous.
func prefixedCols(alias string) string {
	parts := strings.Split(cols, ", ")
	for i, p := range parts {
		parts[i] = alias + "." + p
	}
	return strings.Join(parts, ", ")
}

// itoaPos — small int → decimal string untuk positional arg $1, $2, ...
// Ditinggal simple (max 999 args cukup untuk WHERE builder).
func itoaPos(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	if n < 100 {
		return string(rune('0'+n/10)) + string(rune('0'+n%10))
	}
	return string(rune('0'+n/100)) + string(rune('0'+(n/10)%10)) + string(rune('0'+n%10))
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
