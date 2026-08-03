// Package wallet_local — internal deposit wallet di web builder side (Phase 1
// self-sufficient). Menggantikan legacy wallet package yang proxy ke
// external service.
//
// Design invariants:
//   - Balance monotone-consistent: sum(ledger.delta) == balances.balance
//     untuk 1 user (rebuild-able dari ledger scan kalau drift).
//   - Topup + Debit atomic via SQL transaction dengan row-level lock
//     (SELECT FOR UPDATE) supaya concurrent request tidak double-debit atau
//     over-debit di bawah balance 0.
//   - CHECK constraint di DB: balance >= 0 + balance_after >= 0 — hard
//     invariant, application error kalau code lupa cek.
package wallet_local

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound         = errors.New("wallet not found")
	ErrInsufficient     = errors.New("saldo wallet tidak cukup")
	ErrInvalidAmount    = errors.New("amount harus > 0")
)

// Ledger reason constants — canonical string, avoid typo.
const (
	ReasonTopup         = "topup"
	ReasonDebitRegister = "debit_register"
	ReasonDebitRenew    = "debit_renew"
	ReasonRefund        = "refund"
	ReasonAdminAdjust   = "admin_adjust"
)

// Balance — 1 row wallet_balances.
type Balance struct {
	UserID    uuid.UUID `json:"user_id"`
	Balance   int64     `json:"balance"`
	Currency  string    `json:"currency"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LedgerEntry — 1 row wallet_ledger. Append-only.
type LedgerEntry struct {
	ID           uuid.UUID       `json:"id"`
	UserID       uuid.UUID       `json:"user_id"`
	Delta        int64           `json:"delta"`
	Reason       string          `json:"reason"`
	ReferenceID  *uuid.UUID      `json:"reference_id,omitempty"`
	BalanceAfter int64           `json:"balance_after"`
	Metadata     json.RawMessage `json:"metadata"`
	CreatedAt    time.Time       `json:"created_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// GetBalance — return current balance. Kalau row belum ada (user belum
// pernah topup), return Balance{Balance: 0} — user experience "wallet 0"
// bukan "not found".
func (r *Repo) GetBalance(ctx context.Context, userID uuid.UUID) (*Balance, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT user_id, balance, currency, created_at, updated_at
		FROM wallet_balances WHERE user_id = $1
	`, userID)
	var b Balance
	if err := row.Scan(&b.UserID, &b.Balance, &b.Currency, &b.CreatedAt, &b.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &Balance{
				UserID:   userID,
				Balance:  0,
				Currency: "IDR",
			}, nil
		}
		return nil, err
	}
	return &b, nil
}

// TopupInput — payload untuk Credit balance.
type TopupInput struct {
	UserID      uuid.UUID
	Amount      int64 // WAJIB positif
	ReferenceID *uuid.UUID
	Metadata    []byte
	Reason      string // default: ReasonTopup
}

// Credit — tambah balance + insert ledger dalam 1 transaksi. Atomic via
// row-level lock. Idempotent kalau caller pakai referenceID unik + guard
// duplicate check di service layer (repo tidak enforce unique reference).
func (r *Repo) Credit(ctx context.Context, in TopupInput) (*LedgerEntry, error) {
	if in.Amount <= 0 {
		return nil, ErrInvalidAmount
	}
	if in.Reason == "" {
		in.Reason = ReasonTopup
	}
	if len(in.Metadata) == 0 {
		in.Metadata = []byte(`{}`)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// UPSERT balance dengan row lock; kalau row belum ada, INSERT dengan
	// balance=amount.
	var newBalance int64
	err = tx.QueryRow(ctx, `
		INSERT INTO wallet_balances (user_id, balance, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (user_id) DO UPDATE SET
		    balance = wallet_balances.balance + EXCLUDED.balance,
		    updated_at = now()
		RETURNING balance
	`, in.UserID, in.Amount).Scan(&newBalance)
	if err != nil {
		return nil, err
	}

	// Insert ledger entry.
	entry, err := insertLedger(ctx, tx, in.UserID, in.Amount, in.Reason,
		in.ReferenceID, newBalance, in.Metadata)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return entry, nil
}

// DebitInput — payload untuk debit balance.
type DebitInput struct {
	UserID      uuid.UUID
	Amount      int64 // WAJIB positif (repo negate internal untuk ledger.delta)
	ReferenceID *uuid.UUID
	Metadata    []byte
	Reason      string // "debit_register" | "debit_renew" | dst.
}

// Debit — kurangi balance kalau cukup. Return ErrInsufficient kalau
// balance < amount. Atomic via row lock — cegah race concurrent debit.
func (r *Repo) Debit(ctx context.Context, in DebitInput) (*LedgerEntry, error) {
	if in.Amount <= 0 {
		return nil, ErrInvalidAmount
	}
	if in.Reason == "" {
		return nil, errors.New("reason wajib untuk debit")
	}
	if len(in.Metadata) == 0 {
		in.Metadata = []byte(`{}`)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// SELECT FOR UPDATE — lock row (atau blocking kalau row belum ada,
	// treat as balance 0).
	var currentBalance int64
	err = tx.QueryRow(ctx, `
		SELECT balance FROM wallet_balances WHERE user_id = $1 FOR UPDATE
	`, in.UserID).Scan(&currentBalance)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Belum ada wallet row — pasti insufficient.
			return nil, ErrInsufficient
		}
		return nil, err
	}
	if currentBalance < in.Amount {
		return nil, ErrInsufficient
	}
	newBalance := currentBalance - in.Amount

	// Update balance.
	_, err = tx.Exec(ctx, `
		UPDATE wallet_balances SET balance = $2, updated_at = now()
		WHERE user_id = $1
	`, in.UserID, newBalance)
	if err != nil {
		return nil, err
	}

	// Insert ledger dengan delta negative.
	entry, err := insertLedger(ctx, tx, in.UserID, -in.Amount, in.Reason,
		in.ReferenceID, newBalance, in.Metadata)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return entry, nil
}

// ListLedger — paginated history untuk user. DESC by created_at.
func (r *Repo) ListLedger(ctx context.Context, userID uuid.UUID, limit, offset int) ([]LedgerEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, delta, reason, reference_id, balance_after, metadata, created_at
		FROM wallet_ledger
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LedgerEntry{}
	for rows.Next() {
		var e LedgerEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Delta, &e.Reason,
			&e.ReferenceID, &e.BalanceAfter, &e.Metadata, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// FindByReference — idempotency guard: cari ledger entry existing untuk
// reference_id + reason. Dipakai service layer sebelum Credit/Debit ulang
// (mis. webhook double-fire).
func (r *Repo) FindByReference(ctx context.Context, referenceID uuid.UUID, reason string) (*LedgerEntry, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, delta, reason, reference_id, balance_after, metadata, created_at
		FROM wallet_ledger
		WHERE reference_id = $1 AND reason = $2
		LIMIT 1
	`, referenceID, reason)
	var e LedgerEntry
	if err := row.Scan(&e.ID, &e.UserID, &e.Delta, &e.Reason,
		&e.ReferenceID, &e.BalanceAfter, &e.Metadata, &e.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &e, nil
}

// --- helpers ---

// insertLedger — bikin ledger row di dalam tx. Return full entry.
func insertLedger(
	ctx context.Context, tx pgx.Tx, userID uuid.UUID, delta int64,
	reason string, referenceID *uuid.UUID, balanceAfter int64, metadata []byte,
) (*LedgerEntry, error) {
	row := tx.QueryRow(ctx, `
		INSERT INTO wallet_ledger (user_id, delta, reason, reference_id, balance_after, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, delta, reason, reference_id, balance_after, metadata, created_at
	`, userID, delta, reason, referenceID, balanceAfter, metadata)
	var e LedgerEntry
	if err := row.Scan(&e.ID, &e.UserID, &e.Delta, &e.Reason,
		&e.ReferenceID, &e.BalanceAfter, &e.Metadata, &e.CreatedAt); err != nil {
		return nil, err
	}
	return &e, nil
}
