// Package pricing — 3-tier pricing model (plan section 16).
//
//	Layer 1 — platform_prices  (admin set, per TLD)
//	  retail_*    = client self-purchase via wizard
//	  wholesale_* = cost dari registrar-api (untuk wallet debit reseller/agent)
//
//	Layer 2 — reseller_price_lists (reseller set, per TLD)
//	  agent_*   = kulakan agent (settlement out-of-system)
//	  client_*  = reseller direct-charge client (kalau tanpa agent)
//
//	Layer 3 — agent free-form markup (TIDAK di-track sistem)
package pricing

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("pricing not found")
)

// PlatformPrice — 1 row platform_prices. Wholesale bisa nil kalau
// admin belum sinkron dari registrar; frontend show "—" kalau nil.
type PlatformPrice struct {
	ID                     uuid.UUID  `json:"id"`
	TLD                    string     `json:"tld"`
	RetailRegisterPrice    int64      `json:"retail_register_price"`
	RetailRenewPrice       int64      `json:"retail_renew_price"`
	WholesaleRegisterPrice *int64     `json:"wholesale_register_price,omitempty"`
	WholesaleRenewPrice    *int64     `json:"wholesale_renew_price,omitempty"`
	Currency               string     `json:"currency"`
	UpdatedAt              time.Time  `json:"updated_at"`
	UpdatedBy              *uuid.UUID `json:"updated_by,omitempty"`
}

// ResellerPrice — 1 row reseller_price_lists.
type ResellerPrice struct {
	ID                  uuid.UUID `json:"id"`
	ResellerID          uuid.UUID `json:"reseller_id"`
	TLD                 string    `json:"tld"`
	AgentRegisterPrice  int64     `json:"agent_register_price"`
	AgentRenewPrice     int64     `json:"agent_renew_price"`
	ClientRegisterPrice int64     `json:"client_register_price"`
	ClientRenewPrice    int64     `json:"client_renew_price"`
	Currency            string    `json:"currency"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

// -------- Platform (admin) --------

// ListPlatform — semua row platform_prices, sorted by TLD.
func (r *Repo) ListPlatform(ctx context.Context) ([]PlatformPrice, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, tld, retail_register_price, retail_renew_price,
		       wholesale_register_price, wholesale_renew_price,
		       currency, updated_at, updated_by
		  FROM platform_prices
		 ORDER BY tld ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PlatformPrice{}
	for rows.Next() {
		var p PlatformPrice
		if err := rows.Scan(
			&p.ID, &p.TLD, &p.RetailRegisterPrice, &p.RetailRenewPrice,
			&p.WholesaleRegisterPrice, &p.WholesaleRenewPrice,
			&p.Currency, &p.UpdatedAt, &p.UpdatedBy,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetPlatformByTLD — lookup by TLD (LOWER-cased di caller).
func (r *Repo) GetPlatformByTLD(ctx context.Context, tld string) (*PlatformPrice, error) {
	var p PlatformPrice
	err := r.pool.QueryRow(ctx, `
		SELECT id, tld, retail_register_price, retail_renew_price,
		       wholesale_register_price, wholesale_renew_price,
		       currency, updated_at, updated_by
		  FROM platform_prices WHERE tld = $1
	`, strings.ToLower(strings.TrimSpace(tld))).Scan(
		&p.ID, &p.TLD, &p.RetailRegisterPrice, &p.RetailRenewPrice,
		&p.WholesaleRegisterPrice, &p.WholesaleRenewPrice,
		&p.Currency, &p.UpdatedAt, &p.UpdatedBy,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// UpsertPlatform — insert/update per TLD. Admin set retail + wholesale sekali;
// kalau update, hanya replace field yang non-nil di input.
type UpsertPlatformInput struct {
	TLD                    string
	RetailRegisterPrice    int64
	RetailRenewPrice       int64
	WholesaleRegisterPrice *int64
	WholesaleRenewPrice    *int64
	Currency               string
	UpdatedBy              uuid.UUID
}

func (r *Repo) UpsertPlatform(ctx context.Context, in UpsertPlatformInput) (*PlatformPrice, error) {
	tld := strings.ToLower(strings.TrimSpace(in.TLD))
	currency := in.Currency
	if currency == "" {
		currency = "IDR"
	}
	var p PlatformPrice
	err := r.pool.QueryRow(ctx, `
		INSERT INTO platform_prices
			(tld, retail_register_price, retail_renew_price,
			 wholesale_register_price, wholesale_renew_price,
			 currency, updated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (tld) DO UPDATE SET
			retail_register_price     = EXCLUDED.retail_register_price,
			retail_renew_price        = EXCLUDED.retail_renew_price,
			wholesale_register_price  = COALESCE(EXCLUDED.wholesale_register_price, platform_prices.wholesale_register_price),
			wholesale_renew_price     = COALESCE(EXCLUDED.wholesale_renew_price, platform_prices.wholesale_renew_price),
			currency                  = EXCLUDED.currency,
			updated_at                = now(),
			updated_by                = EXCLUDED.updated_by
		RETURNING id, tld, retail_register_price, retail_renew_price,
		          wholesale_register_price, wholesale_renew_price,
		          currency, updated_at, updated_by
	`, tld, in.RetailRegisterPrice, in.RetailRenewPrice,
		in.WholesaleRegisterPrice, in.WholesaleRenewPrice,
		currency, in.UpdatedBy).Scan(
		&p.ID, &p.TLD, &p.RetailRegisterPrice, &p.RetailRenewPrice,
		&p.WholesaleRegisterPrice, &p.WholesaleRenewPrice,
		&p.Currency, &p.UpdatedAt, &p.UpdatedBy,
	)
	return &p, err
}

// DeletePlatform — hapus row (kalau TLD tidak lagi ditawarkan).
func (r *Repo) DeletePlatform(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM platform_prices WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// -------- Reseller --------

// ListByReseller — semua price list milik 1 reseller. Cross-tenant filter
// via WHERE reseller_id — jangan pernah loosen.
func (r *Repo) ListByReseller(ctx context.Context, resellerID uuid.UUID) ([]ResellerPrice, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, reseller_id, tld,
		       agent_register_price, agent_renew_price,
		       client_register_price, client_renew_price,
		       currency, updated_at
		  FROM reseller_price_lists
		 WHERE reseller_id = $1
		 ORDER BY tld ASC
	`, resellerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ResellerPrice{}
	for rows.Next() {
		var p ResellerPrice
		if err := rows.Scan(
			&p.ID, &p.ResellerID, &p.TLD,
			&p.AgentRegisterPrice, &p.AgentRenewPrice,
			&p.ClientRegisterPrice, &p.ClientRenewPrice,
			&p.Currency, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetResellerPrice — lookup 1 row untuk (reseller, TLD).
func (r *Repo) GetResellerPrice(ctx context.Context, resellerID uuid.UUID, tld string) (*ResellerPrice, error) {
	var p ResellerPrice
	err := r.pool.QueryRow(ctx, `
		SELECT id, reseller_id, tld,
		       agent_register_price, agent_renew_price,
		       client_register_price, client_renew_price,
		       currency, updated_at
		  FROM reseller_price_lists
		 WHERE reseller_id = $1 AND tld = $2
	`, resellerID, strings.ToLower(strings.TrimSpace(tld))).Scan(
		&p.ID, &p.ResellerID, &p.TLD,
		&p.AgentRegisterPrice, &p.AgentRenewPrice,
		&p.ClientRegisterPrice, &p.ClientRenewPrice,
		&p.Currency, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

// UpsertResellerPrice — reseller set price list per TLD.
type UpsertResellerPriceInput struct {
	ResellerID          uuid.UUID
	TLD                 string
	AgentRegisterPrice  int64
	AgentRenewPrice     int64
	ClientRegisterPrice int64
	ClientRenewPrice    int64
	Currency            string
}

func (r *Repo) UpsertResellerPrice(ctx context.Context, in UpsertResellerPriceInput) (*ResellerPrice, error) {
	tld := strings.ToLower(strings.TrimSpace(in.TLD))
	currency := in.Currency
	if currency == "" {
		currency = "IDR"
	}
	var p ResellerPrice
	err := r.pool.QueryRow(ctx, `
		INSERT INTO reseller_price_lists
			(reseller_id, tld,
			 agent_register_price, agent_renew_price,
			 client_register_price, client_renew_price,
			 currency)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (reseller_id, tld) DO UPDATE SET
			agent_register_price  = EXCLUDED.agent_register_price,
			agent_renew_price     = EXCLUDED.agent_renew_price,
			client_register_price = EXCLUDED.client_register_price,
			client_renew_price    = EXCLUDED.client_renew_price,
			currency              = EXCLUDED.currency,
			updated_at            = now()
		RETURNING id, reseller_id, tld,
		          agent_register_price, agent_renew_price,
		          client_register_price, client_renew_price,
		          currency, updated_at
	`, in.ResellerID, tld,
		in.AgentRegisterPrice, in.AgentRenewPrice,
		in.ClientRegisterPrice, in.ClientRenewPrice, currency).Scan(
		&p.ID, &p.ResellerID, &p.TLD,
		&p.AgentRegisterPrice, &p.AgentRenewPrice,
		&p.ClientRegisterPrice, &p.ClientRenewPrice,
		&p.Currency, &p.UpdatedAt,
	)
	return &p, err
}

// DeleteResellerPrice — reseller hapus 1 row (fallback ke retail platform).
func (r *Repo) DeleteResellerPrice(ctx context.Context, id, resellerID uuid.UUID) error {
	ct, err := r.pool.Exec(ctx,
		`DELETE FROM reseller_price_lists WHERE id = $1 AND reseller_id = $2`,
		id, resellerID,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// -------- Query helpers untuk wizard --------

// ResolvedPrice — hasil resolve pricing berdasarkan (tld, caller role).
// Frontend wizard pakai ini untuk display "Kamu bayar Rp X" + optional
// transparency "wholesale Rp Y". Semua field opsional (nil = tidak available).
type ResolvedPrice struct {
	TLD                    string  `json:"tld"`
	Currency               string  `json:"currency"`
	RetailRegisterPrice    *int64  `json:"retail_register_price,omitempty"`    // client self-purchase
	RetailRenewPrice       *int64  `json:"retail_renew_price,omitempty"`
	WholesaleRegisterPrice *int64  `json:"wholesale_register_price,omitempty"` // debit wallet reseller/agent
	WholesaleRenewPrice    *int64  `json:"wholesale_renew_price,omitempty"`
	AgentRegisterPrice     *int64  `json:"agent_register_price,omitempty"`     // dari reseller price list
	AgentRenewPrice        *int64  `json:"agent_renew_price,omitempty"`
	ClientRegisterPrice    *int64  `json:"client_register_price,omitempty"`    // reseller direct-charge
	ClientRenewPrice       *int64  `json:"client_renew_price,omitempty"`
}

// Resolve — kombinasikan platform + reseller price untuk 1 TLD. resellerID
// nil = skip reseller layer. Fallback: kalau reseller belum set price list
// untuk TLD, ResolvedPrice.Agent*/Client* tetap nil (frontend fallback ke
// retail_* atau tampilkan "belum diatur").
func (r *Repo) Resolve(ctx context.Context, tld string, resellerID *uuid.UUID) (*ResolvedPrice, error) {
	tld = strings.ToLower(strings.TrimSpace(tld))
	out := &ResolvedPrice{TLD: tld, Currency: "IDR"}
	// Platform tier — best-effort. TLD yang tidak di-config → semua nil.
	if p, err := r.GetPlatformByTLD(ctx, tld); err == nil && p != nil {
		out.Currency = p.Currency
		retail := p.RetailRegisterPrice
		out.RetailRegisterPrice = &retail
		retailR := p.RetailRenewPrice
		out.RetailRenewPrice = &retailR
		out.WholesaleRegisterPrice = p.WholesaleRegisterPrice
		out.WholesaleRenewPrice = p.WholesaleRenewPrice
	}
	// Reseller tier.
	if resellerID != nil {
		if rp, err := r.GetResellerPrice(ctx, *resellerID, tld); err == nil && rp != nil {
			aR := rp.AgentRegisterPrice
			aRn := rp.AgentRenewPrice
			cR := rp.ClientRegisterPrice
			cRn := rp.ClientRenewPrice
			out.AgentRegisterPrice = &aR
			out.AgentRenewPrice = &aRn
			out.ClientRegisterPrice = &cR
			out.ClientRenewPrice = &cRn
			if rp.Currency != "" {
				out.Currency = rp.Currency
			}
		}
	}
	return out, nil
}
