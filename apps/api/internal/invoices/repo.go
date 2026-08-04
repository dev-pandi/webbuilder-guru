// Package invoices — authoritative invoice state machine di web builder.
//
// Design principles:
//   - repo.go  : raw CRUD + tx-safe number generator (advisory lock).
//   - service.go : business logic (CreateForRegister apply PPN via settings.Service,
//                  MarkPaid idempotent, state transition validation).
//   - handler.go : HTTP endpoints (admin + user).
//   - pdf.go   : PDF generator (basic HTML template — full templating library
//                deferred, satu-satunya external dep untuk MVP).
//
// State machine:
//   draft → unpaid → paid / expired / cancelled
//   paid  → refund
//
// Caller (domain_purchase refactor) typical flow:
//
//   inv, _ := svc.CreateForRegister(ctx, CreateForRegisterInput{...})
//   res, _ := gateway.CreateCharge(ctx, ChargeRequest{OrderID: inv.ID.String(), Amount: inv.Total, ...})
//   // save res.ProviderRefID ke inv.PaymentGwRef
//   // return payment URL ke user
//   // ...
//   // webhook received:
//   svc.MarkPaid(ctx, inv.ID, res.ProviderRefID, paidAt)
package invoices

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound        = errors.New("invoice not found")
	ErrInvalidStatus   = errors.New("invoice status transition tidak valid")
	ErrDuplicateNumber = errors.New("invoice number sudah dipakai")
)

// Status — semua transition di-guard di service layer.
type Status string

const (
	StatusDraft     Status = "draft"
	StatusUnpaid    Status = "unpaid"
	StatusPaid      Status = "paid"
	StatusExpired   Status = "expired"
	StatusRefund    Status = "refund"
	StatusCancelled Status = "cancelled"
)

// Invoice — 1 row.
type Invoice struct {
	ID            uuid.UUID  `json:"id"`
	Number        string     `json:"number"`
	UserID        uuid.UUID  `json:"user_id"`
	PurchasedBy   *uuid.UUID `json:"purchased_by,omitempty"`
	Subtotal      int64      `json:"subtotal"`
	TaxRate       float64    `json:"tax_rate"`
	TaxAmount     int64      `json:"tax_amount"`
	Total         int64      `json:"total"`
	Currency      string     `json:"currency"`
	Status        Status     `json:"status"`
	PaymentMethod string     `json:"payment_method"`
	PaymentGwRef  *string    `json:"payment_gw_ref,omitempty"`
	PaidAt        *time.Time `json:"paid_at,omitempty"`
	DueAt         time.Time  `json:"due_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	Metadata      []byte     `json:"metadata"`

	Lines []InvoiceLine `json:"lines,omitempty"` // hydrated by GetWithLines
}

// InvoiceLine — 1 row invoice_lines.
type InvoiceLine struct {
	ID          uuid.UUID `json:"id"`
	InvoiceID   uuid.UUID `json:"invoice_id"`
	Description string    `json:"description"`
	Quantity    int       `json:"quantity"`
	UnitPrice   int64     `json:"unit_price"`
	Subtotal    int64     `json:"subtotal"`
	SortOrder   int       `json:"sort_order"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// CreateInput — payload untuk insert invoice + N lines dalam 1 transaksi.
type CreateInput struct {
	Number        string
	UserID        uuid.UUID
	PurchasedBy   *uuid.UUID
	Subtotal      int64
	TaxRate       float64
	TaxAmount     int64
	Total         int64
	Currency      string
	PaymentMethod string
	DueAt         time.Time
	Metadata      []byte // JSONB; kalau nil → default "{}"
	Lines         []LineInput
}

type LineInput struct {
	Description string
	Quantity    int
	UnitPrice   int64
	SortOrder   int
}

// Create — insert invoice + lines transactional. Return full Invoice dengan
// Lines hydrated.
func (r *Repo) Create(ctx context.Context, in CreateInput) (*Invoice, error) {
	if in.Currency == "" {
		in.Currency = "IDR"
	}
	if len(in.Metadata) == 0 {
		in.Metadata = []byte(`{}`)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Insert invoice — status default 'draft'. Caller (service) yang decide
	// promote ke 'unpaid' setelah paymentgw.CreateCharge sukses.
	row := tx.QueryRow(ctx, `
		INSERT INTO invoices (number, user_id, purchased_by, subtotal, tax_rate,
		                      tax_amount, total, currency, status, payment_method,
		                      due_at, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11)
		RETURNING id, number, user_id, purchased_by, subtotal, tax_rate, tax_amount,
		          total, currency, status, payment_method, payment_gw_ref, paid_at,
		          due_at, created_at, updated_at, metadata
	`, in.Number, in.UserID, in.PurchasedBy, in.Subtotal, in.TaxRate,
		in.TaxAmount, in.Total, in.Currency, in.PaymentMethod, in.DueAt, in.Metadata)
	inv, err := scanInvoice(row)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrDuplicateNumber
		}
		return nil, err
	}

	// Insert lines.
	for _, l := range in.Lines {
		if l.Quantity <= 0 {
			l.Quantity = 1
		}
		lineRow := tx.QueryRow(ctx, `
			INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, subtotal, sort_order)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, invoice_id, description, quantity, unit_price, subtotal, sort_order
		`, inv.ID, l.Description, l.Quantity, l.UnitPrice, int64(l.Quantity)*l.UnitPrice, l.SortOrder)
		var line InvoiceLine
		if err := lineRow.Scan(&line.ID, &line.InvoiceID, &line.Description,
			&line.Quantity, &line.UnitPrice, &line.Subtotal, &line.SortOrder); err != nil {
			return nil, err
		}
		inv.Lines = append(inv.Lines, line)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &inv, nil
}

// GetByID — return invoice tanpa lines (untuk fast-path list detail item).
func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*Invoice, error) {
	row := r.pool.QueryRow(ctx, invoiceSelect+` WHERE id = $1`, id)
	inv, err := scanInvoice(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &inv, nil
}

// GetWithLines — return invoice + hydrated lines.
func (r *Repo) GetWithLines(ctx context.Context, id uuid.UUID) (*Invoice, error) {
	inv, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	lines, err := r.lines(ctx, id)
	if err != nil {
		return nil, err
	}
	inv.Lines = lines
	return inv, nil
}

// GetByNumber — lookup by number ("INV-2026-08-000123").
func (r *Repo) GetByNumber(ctx context.Context, number string) (*Invoice, error) {
	row := r.pool.QueryRow(ctx, invoiceSelect+` WHERE number = $1`, number)
	inv, err := scanInvoice(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &inv, nil
}

// GetByGatewayRef — untuk webhook receiver: cari invoice by provider_gw_ref
// (Midtrans transaction_id / Paylabs order_ref). ErrNotFound kalau ref belum
// pernah di-save (webhook tiba sebelum SavePaymentRef selesai).
func (r *Repo) GetByGatewayRef(ctx context.Context, ref string) (*Invoice, error) {
	row := r.pool.QueryRow(ctx, invoiceSelect+` WHERE payment_gw_ref = $1`, ref)
	inv, err := scanInvoice(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &inv, nil
}

// ListByUser — paginated list untuk user dashboard.
func (r *Repo) ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Invoice, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx, invoiceSelect+`
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	return scanInvoiceList(rows, err)
}

// ListForTeam — aggregate untuk reseller/agent portal. Include:
//   - Invoice yang user_id-nya di managedClientIDs (client yang di-manage)
//   - Invoice yang purchased_by = callerID (invoice yang caller trigger,
//     mis. reseller beli untuk klien → purchased_by=reseller)
//   - Invoice caller sendiri (self-purchase)
//
// Enrich dengan email + nama user_id (join users) supaya UI bisa tampilkan
// "invoice milik X" tanpa second-fetch.
type TeamInvoice struct {
	Invoice
	UserEmail string `json:"user_email"`
	UserName  string `json:"user_name"`
}

func (r *Repo) ListForTeam(ctx context.Context, callerID uuid.UUID, managedClientIDs, teamActorIDs []uuid.UUID, limit, offset int) ([]TeamInvoice, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	// user_ids = self + managed clients (client-owned invoices).
	userIDs := append([]uuid.UUID{callerID}, managedClientIDs...)
	// actor_ids = caller + agent-agent (untuk match purchased_by field).
	// Kalau kosong (missing dep), fallback ke [callerID] saja.
	actorIDs := teamActorIDs
	if len(actorIDs) == 0 {
		actorIDs = []uuid.UUID{callerID}
	}

	q := `
		SELECT i.id, i.number, i.user_id, i.purchased_by,
		       i.subtotal, i.tax_rate, i.tax_amount, i.total,
		       i.currency, i.status, i.payment_method, i.payment_gw_ref,
		       i.paid_at, i.due_at, i.created_at, i.updated_at, i.metadata,
		       u.email, u.name
		FROM invoices i
		JOIN users u ON u.id = i.user_id
		WHERE i.user_id = ANY($1) OR i.purchased_by = ANY($2)
		ORDER BY i.created_at DESC
		LIMIT $3 OFFSET $4
	`
	rows, err := r.pool.Query(ctx, q, userIDs, actorIDs, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]TeamInvoice, 0)
	for rows.Next() {
		var t TeamInvoice
		if err := rows.Scan(
			&t.ID, &t.Number, &t.UserID, &t.PurchasedBy,
			&t.Subtotal, &t.TaxRate, &t.TaxAmount, &t.Total,
			&t.Currency, &t.Status, &t.PaymentMethod, &t.PaymentGwRef,
			&t.PaidAt, &t.DueAt, &t.CreatedAt, &t.UpdatedAt, &t.Metadata,
			&t.UserEmail, &t.UserName,
		); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListAll — admin.
func (r *Repo) ListAll(ctx context.Context, limit, offset int) ([]Invoice, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, invoiceSelect+`
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	return scanInvoiceList(rows, err)
}

// SavePaymentRef — set payment_gw_ref (Midtrans transaction_id) + promote
// draft → unpaid. Dipanggil service.CreateForRegister setelah CreateCharge sukses.
func (r *Repo) SavePaymentRef(ctx context.Context, id uuid.UUID, ref string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE invoices SET
		    payment_gw_ref = $2,
		    status = 'unpaid',
		    updated_at = now()
		WHERE id = $1 AND status = 'draft'
	`, id, ref)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidStatus // sudah promoted atau tidak ada
	}
	return nil
}

// MarkPaid — idempotent: kalau sudah paid, no-op (return existing). Cegah
// double-webhook processing.
func (r *Repo) MarkPaid(ctx context.Context, id uuid.UUID, paidAt time.Time, providerRef string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE invoices SET
		    status = 'paid',
		    paid_at = $2,
		    payment_gw_ref = COALESCE($3, payment_gw_ref),
		    updated_at = now()
		WHERE id = $1 AND status IN ('unpaid', 'draft')
	`, id, paidAt, nullIfEmpty(providerRef))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// Not-found atau already paid — cek current state.
		inv, gerr := r.GetByID(ctx, id)
		if gerr != nil {
			return gerr
		}
		if inv.Status == StatusPaid {
			return nil // idempotent
		}
		return fmt.Errorf("%w: %s → paid tidak diizinkan", ErrInvalidStatus, inv.Status)
	}
	return nil
}

// MarkStatus — generic status setter (expired, cancelled, refund).
// Guard transition di service layer, repo hanya apply.
func (r *Repo) MarkStatus(ctx context.Context, id uuid.UUID, status Status) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE invoices SET status = $2, updated_at = now() WHERE id = $1
	`, id, string(status))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// NextNumber — atomic generate sequential number untuk bulan ini. Format
// "INV-YYYY-MM-NNNNNN". Advisory lock supaya concurrent insert tidak collide.
//
// Approach: hitung count(*) invoices di bulan ini + 1. Advisory lock 1
// per (year, month) supaya concurrent Create serialize di rekening yang
// sama tanpa lock table.
func (r *Repo) NextNumber(ctx context.Context, now time.Time) (string, error) {
	year, month := now.Year(), int(now.Month())
	// Advisory lock key: (year * 100 + month) — collision domain 1 per bulan.
	lockKey := int64(year*100 + month)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey); err != nil {
		return "", err
	}
	// Count invoices dengan number prefix "INV-YYYY-MM-".
	prefix := fmt.Sprintf("INV-%04d-%02d-", year, month)
	var count int
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM invoices WHERE number LIKE $1`, prefix+"%",
	).Scan(&count); err != nil {
		return "", err
	}
	next := count + 1
	number := fmt.Sprintf("%s%06d", prefix, next)
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return number, nil
}

// lines — helper: fetch semua lines untuk 1 invoice.
func (r *Repo) lines(ctx context.Context, invoiceID uuid.UUID) ([]InvoiceLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, invoice_id, description, quantity, unit_price, subtotal, sort_order
		FROM invoice_lines
		WHERE invoice_id = $1
		ORDER BY sort_order ASC, id ASC
	`, invoiceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvoiceLine{}
	for rows.Next() {
		var l InvoiceLine
		if err := rows.Scan(&l.ID, &l.InvoiceID, &l.Description, &l.Quantity,
			&l.UnitPrice, &l.Subtotal, &l.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// --- SQL fragments + helpers ---

const invoiceSelect = `
	SELECT id, number, user_id, purchased_by, subtotal, tax_rate, tax_amount,
	       total, currency, status, payment_method, payment_gw_ref, paid_at,
	       due_at, created_at, updated_at, metadata
	FROM invoices
`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanInvoice(r rowScanner) (Invoice, error) {
	var inv Invoice
	err := r.Scan(
		&inv.ID, &inv.Number, &inv.UserID, &inv.PurchasedBy,
		&inv.Subtotal, &inv.TaxRate, &inv.TaxAmount, &inv.Total,
		&inv.Currency, &inv.Status, &inv.PaymentMethod, &inv.PaymentGwRef,
		&inv.PaidAt, &inv.DueAt, &inv.CreatedAt, &inv.UpdatedAt, &inv.Metadata,
	)
	return inv, err
}

func scanInvoiceList(rows pgx.Rows, queryErr error) ([]Invoice, error) {
	if queryErr != nil {
		return nil, queryErr
	}
	defer rows.Close()
	out := []Invoice{}
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func pgErrCode(err error) string {
	type coder interface{ SQLState() string }
	var c coder
	if errors.As(err, &c) {
		return c.SQLState()
	}
	return ""
}
