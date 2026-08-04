// topup_repo.go — CRUD untuk wallet_topups. Terpisah dari repo.go supaya
// concern jelas: balance/ledger vs topup tracking.

package wallet_local

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Status enum untuk wallet_topups.
const (
	TopupStatusPendingPayment = "pending_payment"
	TopupStatusCredited       = "credited"
	TopupStatusFailed         = "failed"
	TopupStatusExpired        = "expired"
	TopupStatusCancelled      = "cancelled"
)

// Topup — 1 row wallet_topups.
type Topup struct {
	ID            uuid.UUID  `json:"id"`
	UserID        uuid.UUID  `json:"user_id"`
	InvoiceID     uuid.UUID  `json:"invoice_id"`
	Amount        int64      `json:"amount"`
	Currency      string     `json:"currency"`
	PaymentMethod string     `json:"payment_method"`
	PaymentURL    string     `json:"payment_url,omitempty"`   // gateway redirect URL
	Instructions  string     `json:"instructions,omitempty"`  // manual_bank markdown
	Status        string     `json:"status"`
	Reason        string     `json:"reason,omitempty"`
	LedgerID      *uuid.UUID `json:"ledger_id,omitempty"`
	CreditedAt    *time.Time `json:"credited_at,omitempty"`
	// Proof fields — untuk manual_bank flow. User upload bukti transfer,
	// admin verify + mark invoice paid.
	ProofKey        string     `json:"-"`                            // storage key, jangan expose ke client
	ProofMime       string     `json:"proof_mime,omitempty"`
	ProofSize       int64      `json:"proof_size,omitempty"`
	ProofNote       string     `json:"proof_note,omitempty"`
	ProofUploadedAt *time.Time `json:"proof_uploaded_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type TopupCreateInput struct {
	UserID        uuid.UUID
	InvoiceID     uuid.UUID
	Amount        int64
	PaymentMethod string
	PaymentURL    string
	Instructions  string
}

const topupCols = `id, user_id, invoice_id, amount, currency, payment_method,
	payment_url, instructions, status, reason, ledger_id, credited_at,
	proof_key, proof_mime, proof_size, proof_note, proof_uploaded_at,
	created_at, updated_at`

func scanTopup(row pgx.Row, t *Topup) error {
	return row.Scan(&t.ID, &t.UserID, &t.InvoiceID, &t.Amount, &t.Currency,
		&t.PaymentMethod, &t.PaymentURL, &t.Instructions, &t.Status, &t.Reason,
		&t.LedgerID, &t.CreditedAt,
		&t.ProofKey, &t.ProofMime, &t.ProofSize, &t.ProofNote, &t.ProofUploadedAt,
		&t.CreatedAt, &t.UpdatedAt)
}

func (r *Repo) CreateTopup(ctx context.Context, in TopupCreateInput) (*Topup, error) {
	if in.Amount <= 0 {
		return nil, ErrInvalidAmount
	}
	q := `INSERT INTO wallet_topups
	      (user_id, invoice_id, amount, payment_method, payment_url, instructions)
	      VALUES ($1, $2, $3, $4, $5, $6) RETURNING ` + topupCols
	var t Topup
	if err := scanTopup(r.pool.QueryRow(ctx, q,
		in.UserID, in.InvoiceID, in.Amount, in.PaymentMethod,
		in.PaymentURL, in.Instructions), &t); err != nil {
		return nil, err
	}
	return &t, nil
}

// UpdateTopupPayment — patch payment_url + instructions after gateway CreateCharge.
// Split from CreateTopup supaya row bisa di-persist dulu sebelum gateway call
// (kalau gateway timeout, kita tetap punya audit trail).
func (r *Repo) UpdateTopupPayment(ctx context.Context, id uuid.UUID, paymentURL, instructions string) error {
	_, err := r.pool.Exec(ctx, `UPDATE wallet_topups SET
		payment_url = $1, instructions = $2, updated_at = now()
		WHERE id = $3`, paymentURL, instructions, id)
	return err
}

// GetTopup — ownership-scoped fetch. Return ErrNotFound kalau bukan milik user.
func (r *Repo) GetTopup(ctx context.Context, id, userID uuid.UUID) (*Topup, error) {
	q := `SELECT ` + topupCols + ` FROM wallet_topups WHERE id = $1 AND user_id = $2`
	var t Topup
	if err := scanTopup(r.pool.QueryRow(ctx, q, id, userID), &t); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// GetTopupByInvoice — dipakai payment webhook callback (executor) untuk
// resolve topup row dari invoice.id. Skip ownership check (webhook path).
func (r *Repo) GetTopupByInvoice(ctx context.Context, invoiceID uuid.UUID) (*Topup, error) {
	q := `SELECT ` + topupCols + ` FROM wallet_topups WHERE invoice_id = $1`
	var t Topup
	if err := scanTopup(r.pool.QueryRow(ctx, q, invoiceID), &t); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// ListTopupsByUser — paginated user history.
func (r *Repo) ListTopupsByUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Topup, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx, `SELECT `+topupCols+`
		FROM wallet_topups WHERE user_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Topup, 0)
	for rows.Next() {
		var t Topup
		if err := scanTopup(rows, &t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// AdminListFilter — filter param untuk admin dashboard.
type AdminListFilter struct {
	Status   string // "" = semua; else filter status
	HasProof *bool  // nil = all; true = hanya yang sudah upload bukti
	Limit    int
	Offset   int
}

// AdminTopup — Topup + email/name pemilik supaya admin tidak perlu join manual.
type AdminTopup struct {
	Topup
	UserEmail string `json:"user_email"`
	UserName  string `json:"user_name"`
}

// AdminListTopups — semua user, sortir terbaru. Filter status + has_proof.
func (r *Repo) AdminListTopups(ctx context.Context, f AdminListFilter) ([]AdminTopup, int, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 30
	}

	// Build WHERE dinamis. Filter status pakai equality; has_proof pakai
	// IS NULL / IS NOT NULL untuk kolom proof_uploaded_at.
	where := ""
	args := []any{}
	if f.Status != "" {
		args = append(args, f.Status)
		where += fmt.Sprintf(" WHERE t.status = $%d", len(args))
	}
	if f.HasProof != nil {
		clause := "t.proof_uploaded_at IS NOT NULL"
		if !*f.HasProof {
			clause = "t.proof_uploaded_at IS NULL"
		}
		if where == "" {
			where = " WHERE " + clause
		} else {
			where += " AND " + clause
		}
	}

	// Count total dulu buat pagination.
	var total int
	if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM wallet_topups t"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Full query — LEFT JOIN users supaya null-safe kalau user deleted.
	args = append(args, f.Limit, f.Offset)
	q := `SELECT t.id, t.user_id, t.invoice_id, t.amount, t.currency,
			t.payment_method, t.payment_url, t.instructions, t.status, t.reason,
			t.ledger_id, t.credited_at,
			t.proof_key, t.proof_mime, t.proof_size, t.proof_note, t.proof_uploaded_at,
			t.created_at, t.updated_at,
			COALESCE(u.email, ''), COALESCE(u.name, '')
		FROM wallet_topups t
		LEFT JOIN users u ON u.id = t.user_id` +
		where +
		fmt.Sprintf(" ORDER BY t.created_at DESC LIMIT $%d OFFSET $%d",
			len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]AdminTopup, 0)
	for rows.Next() {
		var t AdminTopup
		if err := rows.Scan(&t.ID, &t.UserID, &t.InvoiceID, &t.Amount, &t.Currency,
			&t.PaymentMethod, &t.PaymentURL, &t.Instructions, &t.Status, &t.Reason,
			&t.LedgerID, &t.CreditedAt,
			&t.ProofKey, &t.ProofMime, &t.ProofSize, &t.ProofNote, &t.ProofUploadedAt,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserEmail, &t.UserName); err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}

// AdminGetTopup — no ownership filter (admin path). Return ErrNotFound
// kalau id tidak ada.
func (r *Repo) AdminGetTopup(ctx context.Context, id uuid.UUID) (*Topup, error) {
	q := `SELECT ` + topupCols + ` FROM wallet_topups WHERE id = $1`
	var t Topup
	if err := scanTopup(r.pool.QueryRow(ctx, q, id), &t); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// MarkTopupCredited — atomically credit wallet ledger + update topup status.
// Dipanggil oleh ExecuteAfterPayment callback saat invoice.kind=topup paid.
//
// Race-safe: kalau topup sudah credited (webhook retry), return existing
// ledger tanpa double-credit. Diperiksa via status=pending_payment.
func (r *Repo) MarkTopupCredited(ctx context.Context, topupID uuid.UUID) (*Topup, *LedgerEntry, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	// Load topup + lock row supaya concurrent webhook tidak double-credit.
	var t Topup
	err = tx.QueryRow(ctx, `SELECT `+topupCols+` FROM wallet_topups
		WHERE id = $1 FOR UPDATE`, topupID).Scan(
		&t.ID, &t.UserID, &t.InvoiceID, &t.Amount, &t.Currency,
		&t.PaymentMethod, &t.PaymentURL, &t.Instructions, &t.Status, &t.Reason,
		&t.LedgerID, &t.CreditedAt,
		&t.ProofKey, &t.ProofMime, &t.ProofSize, &t.ProofNote, &t.ProofUploadedAt,
		&t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, err
	}

	// Idempotency: kalau sudah credited, return existing ledger (bukan double).
	if t.Status == TopupStatusCredited && t.LedgerID != nil {
		var entry LedgerEntry
		err := tx.QueryRow(ctx, `SELECT id, user_id, delta, reason, reference_id,
			balance_after, metadata, created_at FROM wallet_ledger WHERE id = $1`,
			*t.LedgerID).Scan(&entry.ID, &entry.UserID, &entry.Delta, &entry.Reason,
			&entry.ReferenceID, &entry.BalanceAfter, &entry.Metadata, &entry.CreatedAt)
		if err == nil {
			_ = tx.Commit(ctx)
			return &t, &entry, nil
		}
	}
	if t.Status != TopupStatusPendingPayment {
		return nil, nil, errors.New("topup bukan pending_payment (status=" + t.Status + ")")
	}

	// Credit wallet_balances + wallet_ledger dalam 1 transaction.
	// Pattern sama dengan Repo.Credit tapi inline supaya share tx.
	var newBalance int64
	err = tx.QueryRow(ctx, `
		INSERT INTO wallet_balances (user_id, balance)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET
			balance = wallet_balances.balance + EXCLUDED.balance,
			updated_at = now()
		RETURNING balance
	`, t.UserID, t.Amount).Scan(&newBalance)
	if err != nil {
		return nil, nil, err
	}

	var entry LedgerEntry
	invRef := t.InvoiceID
	err = tx.QueryRow(ctx, `
		INSERT INTO wallet_ledger (user_id, delta, reason, reference_id, balance_after)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, delta, reason, reference_id, balance_after, metadata, created_at
	`, t.UserID, t.Amount, ReasonTopup, invRef, newBalance).Scan(
		&entry.ID, &entry.UserID, &entry.Delta, &entry.Reason,
		&entry.ReferenceID, &entry.BalanceAfter, &entry.Metadata, &entry.CreatedAt)
	if err != nil {
		return nil, nil, err
	}

	// Update topup row → credited.
	now := time.Now()
	_, err = tx.Exec(ctx, `UPDATE wallet_topups SET
		status = $1, ledger_id = $2, credited_at = $3, updated_at = $3
		WHERE id = $4`,
		TopupStatusCredited, entry.ID, now, topupID)
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	t.Status = TopupStatusCredited
	t.LedgerID = &entry.ID
	t.CreditedAt = &now
	return &t, &entry, nil
}

// UpdateTopupStatus — non-credited transitions (failed/expired/cancelled).
// Dipakai payment webhook untuk mark failed atau cron untuk expire.
func (r *Repo) UpdateTopupStatus(ctx context.Context, id uuid.UUID, status, reason string) error {
	_, err := r.pool.Exec(ctx, `UPDATE wallet_topups SET
		status = $1, reason = $2, updated_at = now()
		WHERE id = $3 AND status = 'pending_payment'`,
		status, reason, id)
	return err
}

// SetTopupProof — persist upload bukti transfer (manual_bank flow).
// Ownership check by user_id + guard status=pending_payment supaya user
// tidak bisa upload ulang setelah credited/failed.
func (r *Repo) SetTopupProof(ctx context.Context, id, userID uuid.UUID,
	key, mime string, size int64, note string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE wallet_topups SET
		proof_key = $1, proof_mime = $2, proof_size = $3, proof_note = $4,
		proof_uploaded_at = now(), updated_at = now()
		WHERE id = $5 AND user_id = $6 AND status = 'pending_payment'`,
		key, mime, size, note, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
