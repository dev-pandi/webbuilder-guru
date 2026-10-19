// Package forms manage form definitions + submissions per site. User-configured
// forms (kontak, newsletter, custom) rendered di renderer, submit ke public
// endpoint → simpan di form_submissions + notify owner via email.
package forms

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Kind constants — konsisten dengan block type di editor.
const (
	KindContact    = "contact"
	KindNewsletter = "newsletter"
	KindCustom     = "custom"
)

// FormField = 1 input di form. Type mirror HTML input types plus "textarea".
// Validation minimal — mostly presentational, backend cuma cek required.
type FormField struct {
	Name        string `json:"name"`               // key di data_json
	Label       string `json:"label"`              // label UI
	Type        string `json:"type"`               // "text" | "email" | "tel" | "textarea" | "url"
	Required    bool   `json:"required,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
}

type Form struct {
	ID           uuid.UUID   `json:"id"`
	SiteID       uuid.UUID   `json:"site_id"`
	Name         string      `json:"name"`
	Kind         string      `json:"kind"`
	Fields       []FormField `json:"fields"`
	NotifyEmail  string      `json:"notify_email"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

type Submission struct {
	ID          uuid.UUID       `json:"id"`
	FormID      uuid.UUID       `json:"form_id"`
	Data        json.RawMessage `json:"data"` // arbitrary JSON dari client
	SourceIP    string          `json:"source_ip"`
	UserAgent   string          `json:"user_agent"`
	SubmittedAt time.Time       `json:"submitted_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("form not found")

// ---------- Forms ----------

const formCols = `id, site_id, name, kind, fields_json, notify_email, created_at, updated_at`

func scanForm(row pgx.Row, f *Form) error {
	var fieldsRaw []byte
	err := row.Scan(&f.ID, &f.SiteID, &f.Name, &f.Kind, &fieldsRaw, &f.NotifyEmail, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return err
	}
	if len(fieldsRaw) > 0 {
		if err := json.Unmarshal(fieldsRaw, &f.Fields); err != nil {
			f.Fields = nil // corrupt data — return empty slice biar tidak crash caller
		}
	}
	return nil
}

func (r *Repo) ListBySite(ctx context.Context, siteID uuid.UUID) ([]Form, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+formCols+` FROM forms WHERE site_id = $1 ORDER BY created_at DESC`,
		siteID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Form
	for rows.Next() {
		var f Form
		if err := scanForm(rows, &f); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// GetByID public — dipakai public submit endpoint. TIDAK cek ownership karena
// endpoint public. Ownership cek terpisah di user-facing endpoints.
func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Form, error) {
	var f Form
	err := scanForm(r.pool.QueryRow(ctx,
		`SELECT `+formCols+` FROM forms WHERE id = $1`, id,
	), &f)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &f, err
}

// GetOwned = GetByID + ownership check via JOIN sites → cegah user A CRUD
// form user B via URL guessing. Dipakai semua user-facing endpoint.
func (r *Repo) GetOwned(ctx context.Context, id, userID uuid.UUID) (*Form, error) {
	var f Form
	err := scanForm(r.pool.QueryRow(ctx, `
		SELECT `+formCols+` FROM forms f
		 WHERE f.id = $1
		   AND EXISTS (SELECT 1 FROM sites s WHERE s.id = f.site_id AND s.user_id = $2)`,
		id, userID,
	), &f)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &f, err
}

// GetOwnedOrAdmin = GetOwned yang di-bypass untuk role admin, supaya admin bisa
// membuka submissions situs user saat support/debug — pola yang sama dipakai
// sites.GetOwnedOrAdmin.
func (r *Repo) GetOwnedOrAdmin(ctx context.Context, id, userID uuid.UUID, isAdmin bool) (*Form, error) {
	var f Form
	err := scanForm(r.pool.QueryRow(ctx, `
		SELECT `+formCols+` FROM forms f
		 WHERE f.id = $1
		   AND ($3 OR EXISTS (SELECT 1 FROM sites s WHERE s.id = f.site_id AND s.user_id = $2))`,
		id, userID, isAdmin,
	), &f)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &f, err
}

func (r *Repo) Create(ctx context.Context, f *Form) error {
	fieldsJSON, err := json.Marshal(f.Fields)
	if err != nil {
		return err
	}
	if f.Kind == "" {
		f.Kind = KindContact
	}
	return scanForm(r.pool.QueryRow(ctx, `
		INSERT INTO forms (site_id, name, kind, fields_json, notify_email)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING `+formCols,
		f.SiteID, f.Name, f.Kind, fieldsJSON, f.NotifyEmail,
	), f)
}

// Update patch — pointer arg = "leave untouched kalau nil".
func (r *Repo) Update(ctx context.Context, id, userID uuid.UUID, name, notifyEmail *string, fields *[]FormField) (*Form, error) {
	// Pre-check ownership supaya user tidak trigger error DB kalau bukan owner.
	if _, err := r.GetOwned(ctx, id, userID); err != nil {
		return nil, err
	}
	var fieldsJSON []byte
	if fields != nil {
		b, err := json.Marshal(*fields)
		if err != nil {
			return nil, err
		}
		fieldsJSON = b
	}
	var f Form
	err := scanForm(r.pool.QueryRow(ctx, `
		UPDATE forms
		   SET name         = COALESCE($2, name),
		       notify_email = COALESCE($3, notify_email),
		       fields_json  = COALESCE($4, fields_json),
		       updated_at   = now()
		 WHERE id = $1
		 RETURNING `+formCols,
		id, name, notifyEmail, fieldsJSON,
	), &f)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &f, err
}

func (r *Repo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	// Ownership check — kalau bukan owner, return NotFound (bukan Forbidden)
	// biar tidak leak keberadaan resource.
	if _, err := r.GetOwned(ctx, id, userID); err != nil {
		return err
	}
	_, err := r.pool.Exec(ctx, `DELETE FROM forms WHERE id = $1`, id)
	return err
}

// ---------- Submissions ----------

const submCols = `id, form_id, data_json, source_ip, user_agent, submitted_at`

func scanSubmission(row pgx.Row, s *Submission) error {
	return row.Scan(&s.ID, &s.FormID, &s.Data, &s.SourceIP, &s.UserAgent, &s.SubmittedAt)
}

// CreateSubmission — dipanggil public endpoint. No ownership cek (form_id
// sudah divalidate exist di public handler).
func (r *Repo) CreateSubmission(ctx context.Context, s *Submission) error {
	return scanSubmission(r.pool.QueryRow(ctx, `
		INSERT INTO form_submissions (form_id, data_json, source_ip, user_agent)
		VALUES ($1,$2,$3,$4)
		RETURNING `+submCols,
		s.FormID, s.Data, s.SourceIP, s.UserAgent,
	), s)
}

// ListSubmissions — paginated, per form. Ownership di-enforce via GetOwned di
// caller (handler cek dulu user boleh akses form ini sebelum panggil sini).
func (r *Repo) ListSubmissions(ctx context.Context, formID uuid.UUID, limit, offset int) ([]Submission, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM form_submissions WHERE form_id = $1`, formID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT `+submCols+` FROM form_submissions
		  WHERE form_id = $1
		  ORDER BY submitted_at DESC
		  LIMIT $2 OFFSET $3`,
		formID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Submission
	for rows.Next() {
		var s Submission
		if err := scanSubmission(rows, &s); err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

// DeleteSubmission — user-triggered cleanup dari inbox. Ownership cek di caller.
func (r *Repo) DeleteSubmission(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM form_submissions WHERE id = $1`, id)
	return err
}

// FormIDBySubmission lookup form_id dari submission_id — dipakai handler
// untuk verify ownership sebelum delete/other action pada submission.
func (r *Repo) FormIDBySubmission(ctx context.Context, subID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT form_id FROM form_submissions WHERE id = $1`, subID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	return id, err
}
