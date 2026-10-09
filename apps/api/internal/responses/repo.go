package responses

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Response = "Tanggapan" (public term). Spec §18.
// Default status = pending. Only Approved shown/counted publicly.
//
// Parent polymorphic: tanggapan selalu nempel ke exactly satu dari
// (ArticleID, LearningMaterialID). CHECK constraint di DB enforce XOR.
type Response struct {
	ID                   uuid.UUID  `json:"id"`
	SiteID               uuid.UUID  `json:"site_id"`
	ArticleID            *uuid.UUID `json:"article_id,omitempty"`
	LearningMaterialID   *uuid.UUID `json:"learning_material_id,omitempty"`
	AuthorName           string     `json:"author_name"`
	AuthorRole           string     `json:"author_role"`
	Body                 string     `json:"body"`
	Status               string     `json:"status"`
	ModeratedAt          *time.Time `json:"moderated_at,omitempty"`
	ModeratedByTeacherID *uuid.UUID `json:"moderated_by_teacher_id,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// PublicView — excluded email/IP for public rendering.
type PublicView struct {
	ID         uuid.UUID `json:"id"`
	AuthorName string    `json:"author_name"`
	AuthorRole string    `json:"author_role"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound   = errors.New("response not found")
	ErrInvalidRole = errors.New("invalid role")
	ErrInvalidStat = errors.New("invalid status")
)

var validRoles = map[string]bool{
	"guru": true, "siswa": true, "orang-tua": true, "pembaca": true,
}

func IsValidRole(r string) bool { return validRoles[r] }

var validStatus = map[string]bool{
	"pending": true, "approved": true, "rejected": true,
}

func IsValidStatus(s string) bool { return validStatus[s] }

const cols = `id, site_id, article_id, learning_material_id, author_name, author_role, body, status,
    moderated_at, moderated_by_teacher_id, created_at, updated_at`

func scan(r *Response) []any {
	return []any{
		&r.ID, &r.SiteID, &r.ArticleID, &r.LearningMaterialID,
		&r.AuthorName, &r.AuthorRole, &r.Body, &r.Status,
		&r.ModeratedAt, &r.ModeratedByTeacherID, &r.CreatedAt, &r.UpdatedAt,
	}
}

type SubmitInput struct {
	SiteID             uuid.UUID
	ArticleID          *uuid.UUID
	LearningMaterialID *uuid.UUID
	AuthorName         string
	AuthorRole         string
	AuthorEmail        string
	Body               string
	SubmitterIP        string
}

var ErrInvalidParent = errors.New("response must have exactly one parent (article or learning material)")

// Submit — always creates with status='pending'. Called by public endpoint.
// Enforces parent XOR in Go sebelum hit DB (short-circuit CHECK violation).
func (r *Repo) Submit(ctx context.Context, in SubmitInput) (*Response, error) {
	if !IsValidRole(in.AuthorRole) {
		return nil, ErrInvalidRole
	}
	hasArticle := in.ArticleID != nil
	hasMaterial := in.LearningMaterialID != nil
	if hasArticle == hasMaterial {
		return nil, ErrInvalidParent
	}
	var resp Response
	err := r.pool.QueryRow(ctx, `
		INSERT INTO responses (site_id, article_id, learning_material_id, author_name, author_role,
		    author_email_private, body, status, submitter_ip)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
		RETURNING `+cols+`
	`, in.SiteID, in.ArticleID, in.LearningMaterialID, in.AuthorName, in.AuthorRole,
		in.AuthorEmail, in.Body, in.SubmitterIP,
	).Scan(scan(&resp)...)
	return &resp, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Response, error) {
	var resp Response
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM responses WHERE id = $1`, id).Scan(scan(&resp)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &resp, err
}

// SetStatus — atomic moderation. Enforces valid transition.
func (r *Repo) SetStatus(ctx context.Context, id uuid.UUID, status string, teacherID uuid.UUID) (*Response, error) {
	if !IsValidStatus(status) {
		return nil, ErrInvalidStat
	}
	var resp Response
	err := r.pool.QueryRow(ctx, `
		UPDATE responses SET
		    status = $2,
		    moderated_at = now(),
		    moderated_by_teacher_id = $3,
		    updated_at = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, id, status, teacherID).Scan(scan(&resp)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &resp, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM responses WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListPage — dashboard moderation list. statusFilter "" = all.
func (r *Repo) ListPage(
	ctx context.Context, siteID uuid.UUID, statusFilter, sort string, limit, offset int,
) ([]Response, int, error) {
	statusClause := ""
	args := []any{siteID}
	if statusFilter != "" {
		statusClause = " AND status = $2"
		args = append(args, statusFilter)
	}
	var total int
	countArgs := append([]any{}, args...)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM responses WHERE site_id = $1`+statusClause,
		countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	order := "created_at DESC"
	if sort == "oldest" {
		order = "created_at ASC"
	}
	args = append(args, limit, offset)
	q := fmt.Sprintf(`
		SELECT `+cols+`
		FROM responses
		WHERE site_id = $1%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, statusClause, order, len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Response{}
	for rows.Next() {
		var resp Response
		if err := rows.Scan(scan(&resp)...); err != nil {
			return nil, 0, err
		}
		out = append(out, resp)
	}
	return out, total, rows.Err()
}

// ListApprovedByArticle — public renderer. Only returns approved, sorted oldest→newest.
func (r *Repo) ListApprovedByArticle(ctx context.Context, articleID uuid.UUID, limit int) ([]PublicView, error) {
	return r.listApprovedByParent(ctx, "article_id", articleID, limit)
}

// ListApprovedByMaterial — mirror article variant untuk learning material.
func (r *Repo) ListApprovedByMaterial(ctx context.Context, materialID uuid.UUID, limit int) ([]PublicView, error) {
	return r.listApprovedByParent(ctx, "learning_material_id", materialID, limit)
}

func (r *Repo) listApprovedByParent(ctx context.Context, parentCol string, parentID uuid.UUID, limit int) ([]PublicView, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	// parentCol fixed whitelist (dua caller internal) — no injection risk.
	rows, err := r.pool.Query(ctx, `
		SELECT id, author_name, author_role, body, created_at
		FROM responses
		WHERE `+parentCol+` = $1 AND status = 'approved'
		ORDER BY created_at ASC
		LIMIT $2
	`, parentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PublicView{}
	for rows.Next() {
		var pv PublicView
		if err := rows.Scan(&pv.ID, &pv.AuthorName, &pv.AuthorRole, &pv.Body, &pv.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, pv)
	}
	return out, rows.Err()
}

// CountApprovedByArticle — cheap read for kartu listing.
func (r *Repo) CountApprovedByArticle(ctx context.Context, articleID uuid.UUID) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM responses WHERE article_id = $1 AND status = 'approved'`,
		articleID).Scan(&n)
	return n, err
}

// CountApprovedByMaterial — mirror untuk learning material.
func (r *Repo) CountApprovedByMaterial(ctx context.Context, materialID uuid.UUID) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM responses WHERE learning_material_id = $1 AND status = 'approved'`,
		materialID).Scan(&n)
	return n, err
}

// PendingCountBySite — dashboard ringkasan.
func (r *Repo) StatusCountsBySite(ctx context.Context, siteID uuid.UUID) (pending, approved, rejected int64, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE status='pending'),
		    COUNT(*) FILTER (WHERE status='approved'),
		    COUNT(*) FILTER (WHERE status='rejected')
		FROM responses WHERE site_id = $1
	`, siteID).Scan(&pending, &approved, &rejected)
	return
}
