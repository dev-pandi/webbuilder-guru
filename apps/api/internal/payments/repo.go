// Package payments — payment_methods CRUD + config schema per gateway type.
// Konsumer (paymentgw package, domain_purchase wizard) call GetByCode(ctx,
// "midtrans") untuk fetch config + credentials, kemudian instansiasi Gateway
// concrete lewat paymentgw factory.
//
// Config JSONB shape validate di package ini (per type), bukan di DB.
package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound    = errors.New("payment method not found")
	ErrCodeTaken   = errors.New("payment method code sudah dipakai")
	ErrInvalidType = errors.New("payment method type harus gateway|manual|wallet")
)

// Type taxonomy — enum-like constant supaya caller tidak string-typo.
const (
	TypeGateway = "gateway" // online API (Midtrans/Paylabs)
	TypeManual  = "manual"  // manual verification (transfer bank)
	TypeWallet  = "wallet"  // internal deposit balance
)

// Code — canonical payment method codes.
const (
	CodeDepositWallet = "deposit_wallet"
	CodeMidtrans      = "midtrans"
	CodePaylabs       = "paylabs"
	CodeManualBank    = "manual_bank"
)

// PaymentMethod — 1 row.
type PaymentMethod struct {
	ID        uuid.UUID       `json:"id"`
	Code      string          `json:"code"`
	Label     string          `json:"label"`
	Type      string          `json:"type"`
	Enabled   bool            `json:"enabled"`
	Config    json.RawMessage `json:"config"`
	SortOrder int             `json:"sort_order"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
	UpdatedBy *uuid.UUID      `json:"updated_by,omitempty"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// ListAll — admin: semua methods (enabled + disabled). Sort by sort_order.
func (r *Repo) ListAll(ctx context.Context) ([]PaymentMethod, error) {
	return r.list(ctx, false)
}

// ListEnabled — user-facing: hanya enabled. Wizard checkout pakai ini.
// Kembalikan config sudah di-mask (credential field diganti "***").
func (r *Repo) ListEnabled(ctx context.Context) ([]PaymentMethod, error) {
	items, err := r.list(ctx, true)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].Config = maskCredentials(items[i].Code, items[i].Config)
	}
	return items, nil
}

func (r *Repo) list(ctx context.Context, enabledOnly bool) ([]PaymentMethod, error) {
	query := `
		SELECT id, code, label, type, enabled, config, sort_order,
		       created_at, updated_at, updated_by
		FROM payment_methods
		%s
		ORDER BY sort_order ASC, code ASC
	`
	where := ""
	if enabledOnly {
		where = "WHERE enabled = true"
	}
	rows, err := r.pool.Query(ctx, fmt.Sprintf(query, where))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PaymentMethod{}
	for rows.Next() {
		m, err := scanMethod(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetByCode — lookup by canonical code ("midtrans"). Config UNMASKED —
// caller yang tahu dia admin/gateway consumer, bukan user-facing.
func (r *Repo) GetByCode(ctx context.Context, code string) (*PaymentMethod, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	row := r.pool.QueryRow(ctx, `
		SELECT id, code, label, type, enabled, config, sort_order,
		       created_at, updated_at, updated_by
		FROM payment_methods WHERE code = $1
	`, code)
	m, err := scanMethod(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

// GetByID — admin lookup by UUID.
func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*PaymentMethod, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, code, label, type, enabled, config, sort_order,
		       created_at, updated_at, updated_by
		FROM payment_methods WHERE id = $1
	`, id)
	m, err := scanMethod(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

// CreateInput — payload create custom payment method (mis. tambah gateway
// baru selain 4 default).
type CreateInput struct {
	Code      string
	Label     string
	Type      string
	SortOrder int
	Config    json.RawMessage
	CreatedBy *uuid.UUID
}

func (r *Repo) Create(ctx context.Context, in CreateInput) (*PaymentMethod, error) {
	in.Code = strings.ToLower(strings.TrimSpace(in.Code))
	if !validType(in.Type) {
		return nil, ErrInvalidType
	}
	if len(in.Config) == 0 {
		in.Config = json.RawMessage(`{}`)
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO payment_methods (code, label, type, enabled, config, sort_order, updated_by)
		VALUES ($1, $2, $3, false, $4, $5, $6)
		RETURNING id, code, label, type, enabled, config, sort_order,
		          created_at, updated_at, updated_by
	`, in.Code, in.Label, in.Type, in.Config, in.SortOrder, in.CreatedBy)
	m, err := scanMethod(row)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrCodeTaken
		}
		return nil, err
	}
	return &m, nil
}

// UpdateInput — partial update dari admin.
type UpdateInput struct {
	Label     *string
	Enabled   *bool
	Config    json.RawMessage // nil = tidak update; non-nil (bisa "{}") = replace
	SortOrder *int
	UpdatedBy *uuid.UUID
}

// Update — COALESCE pattern. Config JSONB replace all kalau di-supply.
func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*PaymentMethod, error) {
	// Config perlu handling khusus karena json.RawMessage([]byte) nil check.
	var configArg any
	if in.Config != nil {
		configArg = in.Config
	} else {
		configArg = nil
	}
	row := r.pool.QueryRow(ctx, `
		UPDATE payment_methods SET
		    label      = COALESCE($2, label),
		    enabled    = COALESCE($3, enabled),
		    config     = COALESCE($4::jsonb, config),
		    sort_order = COALESCE($5, sort_order),
		    updated_at = now(),
		    updated_by = COALESCE($6, updated_by)
		WHERE id = $1
		RETURNING id, code, label, type, enabled, config, sort_order,
		          created_at, updated_at, updated_by
	`, id, in.Label, in.Enabled, configArg, in.SortOrder, in.UpdatedBy)
	m, err := scanMethod(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

// Delete — hard delete. Foreign key ke invoices/payments nanti akan block
// (ON DELETE RESTRICT). Untuk MVP: hard delete.
func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM payment_methods WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- helpers ---

func validType(t string) bool {
	switch t {
	case TypeGateway, TypeManual, TypeWallet:
		return true
	}
	return false
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanMethod(r rowScanner) (PaymentMethod, error) {
	var m PaymentMethod
	err := r.Scan(
		&m.ID, &m.Code, &m.Label, &m.Type, &m.Enabled, &m.Config, &m.SortOrder,
		&m.CreatedAt, &m.UpdatedAt, &m.UpdatedBy,
	)
	return m, err
}

func pgErrCode(err error) string {
	type coder interface{ SQLState() string }
	var c coder
	if errors.As(err, &c) {
		return c.SQLState()
	}
	return ""
}

// maskCredentials — untuk endpoint public/list, ganti credential-bearing
// field dengan "***". Non-credential field (bank list, instructions_md,
// snap_url, is_production, topup_min/max) tetap plaintext karena user butuh.
//
// Kalau code tidak dikenal atau tidak punya credential key, return as-is
// (skip unmarshal-remarshal supaya JSON byte-identical + no ordering change).
func maskCredentials(code string, raw json.RawMessage) json.RawMessage {
	sensitive := credentialKeys(code)
	if len(sensitive) == 0 {
		return raw
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return raw
	}
	touched := false
	for _, k := range sensitive {
		if _, ok := cfg[k]; ok {
			cfg[k] = "***"
			touched = true
		}
	}
	if !touched {
		return raw
	}
	masked, err := json.Marshal(cfg)
	if err != nil {
		return raw
	}
	return masked
}

func credentialKeys(code string) []string {
	switch code {
	case CodeMidtrans:
		return []string{"server_key", "client_key"}
	case CodePaylabs:
		return []string{"api_key", "merchant_id"}
	}
	return nil
}
