// Package email_log — audit trail untuk setiap email send attempt. Dipakai
// via `LoggingSender` wrapper yang membungkus mail.Sender existing supaya
// tiap Send() insert 1 row (sukses / gagal + error).
package email_log

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/webbuilder/api/internal/mail"
)

// Entry — 1 row email_log.
type Entry struct {
	ID          uuid.UUID `json:"id"`
	To          string    `json:"to_address"`
	Subject     string    `json:"subject"`
	BodyPreview string    `json:"body_preview"`
	Driver      string    `json:"driver"`
	Status      string    `json:"status"` // sent | failed
	Error       string    `json:"error,omitempty"`
	DurationMs  int       `json:"duration_ms"`
	CreatedAt   time.Time `json:"created_at"`
}

const (
	StatusSent   = "sent"
	StatusFailed = "failed"
)

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// Log insert 1 row. Fail-silent — kalau DB down, tidak block email send flow
// (caller wrapper log warn + lanjut).
func (r *Repo) Log(ctx context.Context, e Entry) error {
	// Body preview cap 500 char supaya tabel tidak bloat + body long (mis.
	// invoice HTML) tidak flood dashboard.
	preview := e.BodyPreview
	if len(preview) > 500 {
		preview = preview[:500] + "…"
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO email_log (to_address, subject, body_preview, driver, status, error, duration_ms)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, e.To, e.Subject, preview, e.Driver, e.Status, e.Error, e.DurationMs)
	return err
}

// ListFilter — query params untuk halaman admin viewer.
type ListFilter struct {
	Status string // "" = all
	To     string // ILIKE match (case-insensitive)
	Limit  int
	Offset int
}

// List — paginated timeline DESC. Total return untuk pagination.
func (r *Repo) List(ctx context.Context, f ListFilter) ([]Entry, int, error) {
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	where := []string{"1=1"}
	args := []any{}
	i := 1
	if f.Status != "" {
		where = append(where, "status = $"+itoa(i))
		args = append(args, f.Status)
		i++
	}
	if s := strings.TrimSpace(f.To); s != "" {
		where = append(where, "LOWER(to_address) LIKE $"+itoa(i))
		args = append(args, "%"+strings.ToLower(s)+"%")
		i++
	}
	whereSQL := strings.Join(where, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM email_log WHERE "+whereSQL,
		args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	dataArgs := append(append([]any{}, args...), limit, f.Offset)
	rows, err := r.pool.Query(ctx, `
		SELECT id, to_address, subject, body_preview, driver, status, error, duration_ms, created_at
		  FROM email_log
		 WHERE `+whereSQL+`
		 ORDER BY created_at DESC
		 LIMIT $`+itoa(i)+` OFFSET $`+itoa(i+1),
		dataArgs...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(
			&e.ID, &e.To, &e.Subject, &e.BodyPreview, &e.Driver,
			&e.Status, &e.Error, &e.DurationMs, &e.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, e)
	}
	return out, total, rows.Err()
}

// LoggingSender — wrapper untuk mail.Sender existing. Fire log kabur setiap
// send attempt. Compose pattern: kalau underlying nil, no-op.
type LoggingSender struct {
	inner mail.Sender
	repo  *Repo
}

// Wrap membungkus mail.Sender + repo. Kalau salah satu nil, return `inner`
// apa adanya (no logging).
func Wrap(inner mail.Sender, repo *Repo) mail.Sender {
	if inner == nil || repo == nil {
		return inner
	}
	return &LoggingSender{inner: inner, repo: repo}
}

func (s *LoggingSender) Driver() string { return s.inner.Driver() }

func (s *LoggingSender) Send(ctx context.Context, m mail.Message) error {
	start := time.Now()
	err := s.inner.Send(ctx, m)
	duration := time.Since(start)

	status := StatusSent
	errMsg := ""
	if err != nil {
		status = StatusFailed
		errMsg = err.Error()
	}
	// Log ke DB — pakai context.Background supaya batal-nya request tidak
	// batalkan audit (email sudah keburu terkirim atau gagal). Fail-silent.
	_ = s.repo.Log(context.Background(), Entry{
		To:          m.To,
		Subject:     m.Subject,
		BodyPreview: m.Body,
		Driver:      s.inner.Driver(),
		Status:      status,
		Error:       errMsg,
		DurationMs:  int(duration.Milliseconds()),
	})
	return err
}

// itoa helper — sama seperti di audit repo. Batas 999 args cukup.
func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	if n < 100 {
		return string(rune('0'+n/10)) + string(rune('0'+n%10))
	}
	return string(rune('0'+n/100)) + string(rune('0'+(n/10)%10)) + string(rune('0'+n%10))
}

// _ = pgx.ErrNoRows — kept in case future adds Get() method.
var _ = pgx.ErrNoRows
var _ = errors.New
