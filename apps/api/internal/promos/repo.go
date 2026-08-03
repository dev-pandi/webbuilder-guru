// repo.go — CRUD untuk promo_codes + promo_redemptions.
//
// Validation + apply logic hidup di service.go — repo hanya raw DB access.

package promos

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound  = errors.New("promo not found")
	ErrCodeTaken = errors.New("promo code sudah dipakai")
)

const (
	DiscountPercent = "percent"
	DiscountFixed   = "fixed"

	AppliesToRegister = "register"
	AppliesToRenew    = "renew"
	AppliesToBoth     = "both"
)

type Promo struct {
	ID              uuid.UUID  `json:"id"`
	Code            string     `json:"code"`
	Description     string     `json:"description"`
	DiscountType    string     `json:"discount_type"`
	DiscountValue   int64      `json:"discount_value"`
	AppliesTo       string     `json:"applies_to"`
	AllowedTLDs     []string   `json:"allowed_tlds"`
	MinSubtotal     int64      `json:"min_subtotal"`
	MaxDiscount     int64      `json:"max_discount"`
	ValidFrom       *time.Time `json:"valid_from,omitempty"`
	ValidUntil      *time.Time `json:"valid_until,omitempty"`
	MaxUses         *int       `json:"max_uses,omitempty"`
	MaxUsesPerUser  int        `json:"max_uses_per_user"`
	Active          bool       `json:"active"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	CreatedBy       *uuid.UUID `json:"created_by,omitempty"`
}

type Redemption struct {
	ID              uuid.UUID `json:"id"`
	PromoID         uuid.UUID `json:"promo_id"`
	UserID          uuid.UUID `json:"user_id"`
	InvoiceID       uuid.UUID `json:"invoice_id"`
	DiscountApplied int64     `json:"discount_applied"`
	CreatedAt       time.Time `json:"created_at"`
}

type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

const promoCols = `id, code, description, discount_type, discount_value, applies_to,
	allowed_tlds, min_subtotal, max_discount, valid_from, valid_until,
	max_uses, max_uses_per_user, active, created_at, updated_at, created_by`

func scanPromo(row pgx.Row, p *Promo) error {
	return row.Scan(&p.ID, &p.Code, &p.Description, &p.DiscountType, &p.DiscountValue,
		&p.AppliesTo, &p.AllowedTLDs, &p.MinSubtotal, &p.MaxDiscount,
		&p.ValidFrom, &p.ValidUntil, &p.MaxUses, &p.MaxUsesPerUser,
		&p.Active, &p.CreatedAt, &p.UpdatedAt, &p.CreatedBy)
}

// GetByCode — lookup case-insensitive. Return ErrNotFound kalau tidak ada.
func (r *Repo) GetByCode(ctx context.Context, code string) (*Promo, error) {
	q := `SELECT ` + promoCols + ` FROM promo_codes WHERE code = UPPER($1)`
	var p Promo
	if err := scanPromo(r.pool.QueryRow(ctx, q, code), &p); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Promo, error) {
	q := `SELECT ` + promoCols + ` FROM promo_codes WHERE id = $1`
	var p Promo
	if err := scanPromo(r.pool.QueryRow(ctx, q, id), &p); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// CountRedemptions — total redemptions untuk 1 promo.
func (r *Repo) CountRedemptions(ctx context.Context, promoID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM promo_redemptions WHERE promo_id = $1`, promoID).Scan(&n)
	return n, err
}

// CountRedemptionsByUser — redemptions untuk 1 promo oleh 1 user.
func (r *Repo) CountRedemptionsByUser(ctx context.Context, promoID, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM promo_redemptions WHERE promo_id = $1 AND user_id = $2`,
		promoID, userID).Scan(&n)
	return n, err
}

// RedemptionRow — enriched dengan user email untuk admin table.
type RedemptionRow struct {
	ID              uuid.UUID `json:"id"`
	PromoID         uuid.UUID `json:"promo_id"`
	UserID          uuid.UUID `json:"user_id"`
	UserEmail       string    `json:"user_email"`
	UserName        string    `json:"user_name"`
	InvoiceID       uuid.UUID `json:"invoice_id"`
	InvoiceNumber   string    `json:"invoice_number"`
	DiscountApplied int64     `json:"discount_applied"`
	CreatedAt       time.Time `json:"created_at"`
}

// ListRedemptionsByPromo — history redemption untuk 1 promo, join users +
// invoices supaya admin dashboard bisa tampilkan email + invoice number
// dalam 1 query.
func (r *Repo) ListRedemptionsByPromo(ctx context.Context, promoID uuid.UUID, limit int) ([]RedemptionRow, error) {
	if limit <= 0 {
		limit = 100
	}
	q := `SELECT r.id, r.promo_id, r.user_id, u.email, u.name,
	             r.invoice_id, i.number, r.discount_applied, r.created_at
	      FROM promo_redemptions r
	      JOIN users    u ON u.id = r.user_id
	      JOIN invoices i ON i.id = r.invoice_id
	      WHERE r.promo_id = $1
	      ORDER BY r.created_at DESC
	      LIMIT $2`
	rows, err := r.pool.Query(ctx, q, promoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]RedemptionRow, 0)
	for rows.Next() {
		var rr RedemptionRow
		if err := rows.Scan(&rr.ID, &rr.PromoID, &rr.UserID, &rr.UserEmail, &rr.UserName,
			&rr.InvoiceID, &rr.InvoiceNumber, &rr.DiscountApplied, &rr.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, rr)
	}
	return out, rows.Err()
}

// InsertRedemption — race-safe via unique index di invoice_id. Kalau invoice
// sudah pernah di-redeem, akan error unique violation → caller treat sebagai
// no-op (idempotent).
func (r *Repo) InsertRedemption(ctx context.Context, rd *Redemption) error {
	q := `INSERT INTO promo_redemptions (promo_id, user_id, invoice_id, discount_applied)
	      VALUES ($1, $2, $3, $4)
	      RETURNING id, created_at`
	return r.pool.QueryRow(ctx, q,
		rd.PromoID, rd.UserID, rd.InvoiceID, rd.DiscountApplied,
	).Scan(&rd.ID, &rd.CreatedAt)
}

// ListAdmin — semua promo untuk admin dashboard. Order: active dulu, terbaru dulu.
func (r *Repo) ListAdmin(ctx context.Context) ([]Promo, error) {
	q := `SELECT ` + promoCols + ` FROM promo_codes
	      ORDER BY active DESC, created_at DESC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Promo, 0)
	for rows.Next() {
		var p Promo
		if err := scanPromo(rows, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CreateInput — payload admin create.
type CreateInput struct {
	Code            string
	Description     string
	DiscountType    string
	DiscountValue   int64
	AppliesTo       string
	AllowedTLDs     []string
	MinSubtotal     int64
	MaxDiscount     int64
	ValidFrom       *time.Time
	ValidUntil      *time.Time
	MaxUses         *int
	MaxUsesPerUser  int
	CreatedBy       *uuid.UUID
}

func (r *Repo) Create(ctx context.Context, in CreateInput) (*Promo, error) {
	q := `INSERT INTO promo_codes
	      (code, description, discount_type, discount_value, applies_to,
	       allowed_tlds, min_subtotal, max_discount, valid_from, valid_until,
	       max_uses, max_uses_per_user, created_by)
	      VALUES (UPPER($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	      RETURNING ` + promoCols
	var p Promo
	err := scanPromo(r.pool.QueryRow(ctx, q,
		in.Code, in.Description, in.DiscountType, in.DiscountValue, in.AppliesTo,
		in.AllowedTLDs, in.MinSubtotal, in.MaxDiscount, in.ValidFrom, in.ValidUntil,
		in.MaxUses, in.MaxUsesPerUser, in.CreatedBy), &p)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrCodeTaken
		}
		return nil, err
	}
	return &p, nil
}

// UpdateInput — semua field mutable. Nil = tidak ubah (tapi kita expose semua
// karena admin biasanya kirim full payload dari form).
type UpdateInput struct {
	Description     string
	DiscountType    string
	DiscountValue   int64
	AppliesTo       string
	AllowedTLDs     []string
	MinSubtotal     int64
	MaxDiscount     int64
	ValidFrom       *time.Time
	ValidUntil      *time.Time
	MaxUses         *int
	MaxUsesPerUser  int
	Active          bool
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Promo, error) {
	q := `UPDATE promo_codes SET
	         description       = $2,
	         discount_type     = $3,
	         discount_value    = $4,
	         applies_to        = $5,
	         allowed_tlds      = $6,
	         min_subtotal      = $7,
	         max_discount      = $8,
	         valid_from        = $9,
	         valid_until       = $10,
	         max_uses          = $11,
	         max_uses_per_user = $12,
	         active            = $13,
	         updated_at        = now()
	      WHERE id = $1
	      RETURNING ` + promoCols
	var p Promo
	err := scanPromo(r.pool.QueryRow(ctx, q,
		id, in.Description, in.DiscountType, in.DiscountValue, in.AppliesTo,
		in.AllowedTLDs, in.MinSubtotal, in.MaxDiscount, in.ValidFrom, in.ValidUntil,
		in.MaxUses, in.MaxUsesPerUser, in.Active), &p)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM promo_codes WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func isUniqueViolation(err error) bool {
	// pgx error interface exposes SQLState() via pgconn.PgError. Simple
	// substring check safer than type-assert for cross-driver compat.
	if err == nil {
		return false
	}
	return contains(err.Error(), "23505")
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
