// Package abuse — aduan konten dari publik (judi online, pornografi,
// penipuan, ...) beserta bukti berkas, dan penangguhan situs/domain oleh
// admin. Penangguhan ditegakkan di public.SiteByHost, satu-satunya pintu
// renderer untuk me-resolve situs per host.
package abuse

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

// Kategori — sinkron dengan CHECK constraint di migration 0072.
var Categories = map[string]string{
	"judi_online":      "Judi online",
	"pornografi":       "Pornografi",
	"penipuan":         "Penipuan",
	"phishing_malware": "Phishing / malware",
	"sara_kebencian":   "SARA / ujaran kebencian",
	"hoaks":            "Hoaks / disinformasi",
	"hak_cipta":        "Pelanggaran hak cipta",
	"lainnya":          "Lainnya",
}

var Statuses = map[string]bool{"baru": true, "ditinjau": true, "ditindak": true, "ditolak": true}

type Report struct {
	ID           uuid.UUID  `json:"id"`
	ReportedURL  string     `json:"reported_url"`
	ReportedHost string     `json:"reported_host"`
	Category     string     `json:"category"`
	Description  string     `json:"description"`
	ReporterName string     `json:"reporter_name"`
	ReporterMail string     `json:"reporter_email"`
	ReporterIP   string     `json:"-"`
	Status       string     `json:"status"`
	SiteID       *uuid.UUID `json:"site_id,omitempty"`
	AdminNote    string     `json:"admin_note"`
	HandledBy    *uuid.UUID `json:"handled_by,omitempty"`
	HandledAt    *time.Time `json:"handled_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	FileCount    int        `json:"file_count"`
}

type File struct {
	ID         uuid.UUID `json:"id"`
	ReportID   uuid.UUID `json:"-"`
	StorageKey string    `json:"-"`
	Filename   string    `json:"filename"`
	MimeType   string    `json:"mime_type"`
	SizeBytes  int64     `json:"size_bytes"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// NormalizeHost — lowercase, tanpa skema/path/port/www. Dipakai untuk
// menyimpan reported_host dan mencocokkan situs.
func NormalizeHost(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	for _, p := range []string{"https://", "http://"} {
		s = strings.TrimPrefix(s, p)
	}
	if i := strings.IndexAny(s, "/?#"); i >= 0 {
		s = s[:i]
	}
	if i := strings.LastIndex(s, ":"); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimPrefix(s, "www.")
	return strings.TrimSuffix(s, ".")
}

// ResolveSiteID — situs pemilik host, APA PUN statusnya (draft juga), lewat
// tiga sumber yang sama dengan sites.HasSiteForHost. NULL kalau host bukan
// milik platform — aduan tetap diterima, admin yang menilai.
func (r *Repo) ResolveSiteID(ctx context.Context, host string) (*uuid.UUID, error) {
	var id *uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(
			(SELECT dp.site_id FROM domain_purchases dp
			  WHERE dp.domain = ANY($1) AND dp.kind = 'register' AND dp.site_id IS NOT NULL
			  ORDER BY dp.created_at DESC LIMIT 1),
			(SELECT d.site_id FROM domains d
			  WHERE d.hostname = ANY($1) AND d.site_id IS NOT NULL LIMIT 1),
			(SELECT b.site_id FROM site_byo_domains b
			  WHERE b.hostname = ANY($1) LIMIT 1)
		)`, []string{host, "www." + host}).Scan(&id)
	return id, err
}

func (r *Repo) Create(ctx context.Context, rep *Report, files []File) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx, `
		INSERT INTO abuse_reports
			(reported_url, reported_host, category, description,
			 reporter_name, reporter_email, reporter_ip, site_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, status, created_at, updated_at`,
		rep.ReportedURL, rep.ReportedHost, rep.Category, rep.Description,
		rep.ReporterName, rep.ReporterMail, rep.ReporterIP, rep.SiteID,
	).Scan(&rep.ID, &rep.Status, &rep.CreatedAt, &rep.UpdatedAt)
	if err != nil {
		return err
	}
	for i := range files {
		files[i].ReportID = rep.ID
		if _, err := tx.Exec(ctx, `
			INSERT INTO abuse_report_files (report_id, storage_key, filename, mime_type, size_bytes)
			VALUES ($1,$2,$3,$4,$5)`,
			rep.ID, files[i].StorageKey, files[i].Filename, files[i].MimeType, files[i].SizeBytes,
		); err != nil {
			return err
		}
	}
	rep.FileCount = len(files)
	return tx.Commit(ctx)
}

type ListFilter struct {
	Status string
	Q      string // LIKE pattern dari httpx.LikePattern
	Limit  int
	Offset int
}

func (r *Repo) List(ctx context.Context, f ListFilter) ([]Report, int, error) {
	where := `WHERE ($1 = '' OR a.status = $1)
	            AND (a.reported_host ILIKE $2 OR a.reporter_email ILIKE $2 OR a.description ILIKE $2)`
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM abuse_reports a `+where,
		f.Status, f.Q).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+reportCols+`,
		       (SELECT count(*) FROM abuse_report_files f WHERE f.report_id = a.id)
		  FROM abuse_reports a `+where+`
		 ORDER BY CASE a.status WHEN 'baru' THEN 0 WHEN 'ditinjau' THEN 1 ELSE 2 END,
		          a.created_at DESC
		 LIMIT $3 OFFSET $4`, f.Status, f.Q, f.Limit, f.Offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Report{}
	for rows.Next() {
		var rep Report
		if err := rows.Scan(append(reportScan(&rep), &rep.FileCount)...); err != nil {
			return nil, 0, err
		}
		out = append(out, rep)
	}
	return out, total, rows.Err()
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Report, []File, error) {
	var rep Report
	err := r.pool.QueryRow(ctx, `SELECT `+reportCols+` FROM abuse_reports a WHERE a.id = $1`, id).
		Scan(reportScan(&rep)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, report_id, storage_key, filename, mime_type, size_bytes
		  FROM abuse_report_files WHERE report_id = $1 ORDER BY created_at`, id)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	files := []File{}
	for rows.Next() {
		var f File
		if err := rows.Scan(&f.ID, &f.ReportID, &f.StorageKey, &f.Filename, &f.MimeType, &f.SizeBytes); err != nil {
			return nil, nil, err
		}
		files = append(files, f)
	}
	rep.FileCount = len(files)
	return &rep, files, rows.Err()
}

func (r *Repo) GetFile(ctx context.Context, reportID, fileID uuid.UUID) (*File, error) {
	var f File
	err := r.pool.QueryRow(ctx, `
		SELECT id, report_id, storage_key, filename, mime_type, size_bytes
		  FROM abuse_report_files WHERE id = $1 AND report_id = $2`, fileID, reportID).
		Scan(&f.ID, &f.ReportID, &f.StorageKey, &f.Filename, &f.MimeType, &f.SizeBytes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &f, err
}

func (r *Repo) UpdateReview(ctx context.Context, id, adminID uuid.UUID, status, note string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE abuse_reports
		   SET status = $2, admin_note = $3, handled_by = $4, handled_at = now(), updated_at = now()
		 WHERE id = $1`, id, status, note, adminID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- Penangguhan -----------------------------------------------------------

type SiteInfo struct {
	ID              uuid.UUID  `json:"id"`
	Name            string     `json:"name"`
	Slug            string     `json:"slug"`
	Status          string     `json:"status"`
	OwnerEmail      string     `json:"owner_email"`
	OwnerName       string     `json:"owner_name"`
	SuspendedAt     *time.Time `json:"suspended_at,omitempty"`
	SuspendedReason string     `json:"suspended_reason,omitempty"`
}

func (r *Repo) SiteInfo(ctx context.Context, id uuid.UUID) (*SiteInfo, error) {
	var s SiteInfo
	err := r.pool.QueryRow(ctx, `
		SELECT s.id, s.name, s.slug, s.status,
		       COALESCE(u.email,''), COALESCE(u.name,''),
		       s.suspended_at, s.suspended_reason
		  FROM sites s LEFT JOIN users u ON u.id = s.user_id
		 WHERE s.id = $1`, id).
		Scan(&s.ID, &s.Name, &s.Slug, &s.Status, &s.OwnerEmail, &s.OwnerName,
			&s.SuspendedAt, &s.SuspendedReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

type DomainInfo struct {
	Name            string     `json:"name"`
	Status          string     `json:"status"`
	SuspendedAt     *time.Time `json:"suspended_at,omitempty"`
	SuspendedReason string     `json:"suspended_reason,omitempty"`
}

// DomainInfo — hanya domain yang terdaftar lewat platform (registered_domains).
// BYO domain tidak bisa disuspend per domain; tangguhkan situsnya.
func (r *Repo) DomainInfo(ctx context.Context, host string) (*DomainInfo, error) {
	var d DomainInfo
	err := r.pool.QueryRow(ctx, `
		SELECT name, status, suspended_at, suspended_reason
		  FROM registered_domains WHERE name = ANY($1) LIMIT 1`,
		[]string{host, "www." + host}).
		Scan(&d.Name, &d.Status, &d.SuspendedAt, &d.SuspendedReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &d, err
}

func (r *Repo) SetSiteSuspended(ctx context.Context, id uuid.UUID, by *uuid.UUID, reason string, suspend bool) error {
	q := `UPDATE sites SET suspended_at = now(), suspended_reason = $2, suspended_by = $3, updated_at = now() WHERE id = $1`
	args := []any{id, reason, by}
	if !suspend {
		q = `UPDATE sites SET suspended_at = NULL, suspended_reason = '', suspended_by = NULL, updated_at = now() WHERE id = $1`
		args = []any{id}
	}
	tag, err := r.pool.Exec(ctx, q, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) SetDomainSuspended(ctx context.Context, name string, by *uuid.UUID, reason string, suspend bool) error {
	q := `UPDATE registered_domains SET suspended_at = now(), suspended_reason = $2, suspended_by = $3, updated_at = now() WHERE name = $1`
	args := []any{name, reason, by}
	if !suspend {
		q = `UPDATE registered_domains SET suspended_at = NULL, suspended_reason = '', suspended_by = NULL, updated_at = now() WHERE name = $1`
		args = []any{name}
	}
	tag, err := r.pool.Exec(ctx, q, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SuspensionFor — dipanggil public.SiteByHost setelah situs ter-resolve.
// Mengembalikan kode penangguhan ("domain_suspended" / "site_suspended") atau
// "" kalau bebas. Domain diperiksa dulu: domain yang ditangguhkan tetap mati
// walau situsnya dipindah ke domain lain.
func (r *Repo) SuspensionFor(ctx context.Context, host string, siteID uuid.UUID) (string, error) {
	var domainSusp, siteSusp bool
	err := r.pool.QueryRow(ctx, `
		SELECT
			EXISTS (SELECT 1 FROM registered_domains
			         WHERE name = ANY($1) AND suspended_at IS NOT NULL),
			EXISTS (SELECT 1 FROM sites WHERE id = $2 AND suspended_at IS NOT NULL)`,
		[]string{host, strings.TrimPrefix(host, "www."), "www." + strings.TrimPrefix(host, "www.")},
		siteID,
	).Scan(&domainSusp, &siteSusp)
	if err != nil {
		return "", fmt.Errorf("suspension lookup: %w", err)
	}
	switch {
	case domainSusp:
		return "domain_suspended", nil
	case siteSusp:
		return "site_suspended", nil
	}
	return "", nil
}

const reportCols = `a.id, a.reported_url, a.reported_host, a.category, a.description,
	a.reporter_name, a.reporter_email, a.reporter_ip, a.status, a.site_id,
	a.admin_note, a.handled_by, a.handled_at, a.created_at, a.updated_at`

func reportScan(r *Report) []any {
	return []any{&r.ID, &r.ReportedURL, &r.ReportedHost, &r.Category, &r.Description,
		&r.ReporterName, &r.ReporterMail, &r.ReporterIP, &r.Status, &r.SiteID,
		&r.AdminNote, &r.HandledBy, &r.HandledAt, &r.CreatedAt, &r.UpdatedAt}
}
