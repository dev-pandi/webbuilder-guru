package paymentgw

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/webbuilder/api/internal/payments"
)

// Builder — factory func: parse config JSONB → return Gateway concrete.
// Setiap Gateway impl daftar Builder-nya di init() atau di Registry.Register.
type Builder func(m payments.PaymentMethod) (Gateway, error)

// Registry — lookup table dari code → Builder. Registry stateless kalau
// dependent-nya (payments.Repo) di-fetch per-request; kita cache config
// TTL rendah kalau perlu (untuk MVP: fetch tiap CreateCharge — jarang).
type Registry struct {
	repo *payments.Repo

	mu       sync.RWMutex
	builders map[string]Builder

	// walletDebiter — di-inject via SetWalletDebiter. Dipakai buildWallet
	// karena WalletGateway butuh live Debiter (bukan cuma config JSONB).
	// Nil = deposit_wallet gateway tidak akan tersedia (Get return
	// ErrInvalidConfig).
	walletDebiter WalletDebiter
}

// NewRegistry — construct with repo binding. Repo dipakai untuk fetch
// PaymentMethod config saat Get(code) — supaya admin update config langsung
// terpakai tanpa restart.
func NewRegistry(r *payments.Repo) *Registry {
	reg := &Registry{
		repo:     r,
		builders: map[string]Builder{},
	}
	// Auto-register built-in gateways. Order tidak matter.
	reg.Register(payments.CodeManualBank, buildManualBank)
	reg.Register(payments.CodeMidtrans, buildMidtrans)
	reg.Register(payments.CodePaylabs, buildPaylabs)
	// deposit_wallet — special case: butuh WalletDebiter yang di-inject
	// via SetWalletDebiter. Kalau debiter nil, buildWallet error saat Get.
	return reg
}

// Register — tambah/replace Builder untuk code. Dipakai test untuk inject
// fake gateway.
func (r *Registry) Register(code string, b Builder) {
	r.mu.Lock()
	r.builders[code] = b
	r.mu.Unlock()
}

// SetWalletDebiter — inject Debiter untuk WalletGateway. Call di main.go
// setelah wallet_local.Repo di-construct. Panggil sebelum Get("deposit_wallet")
// pertama supaya gateway tersedia.
func (r *Registry) SetWalletDebiter(d WalletDebiter) {
	r.mu.Lock()
	r.walletDebiter = d
	r.mu.Unlock()
}

// Get — resolve code → Gateway. Fetch config dari DB, validate enabled,
// call Builder. Return ErrGatewayNotFound / ErrGatewayDisabled / ErrInvalidConfig.
func (r *Registry) Get(ctx context.Context, code string) (Gateway, error) {
	m, err := r.repo.GetByCode(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("%w: %s (%v)", ErrGatewayNotFound, code, err)
	}
	if !m.Enabled {
		return nil, fmt.Errorf("%w: %s", ErrGatewayDisabled, code)
	}
	// Special case: deposit_wallet butuh WalletDebiter yang di-inject
	// terpisah dari config JSONB.
	if code == payments.CodeDepositWallet {
		r.mu.RLock()
		debiter := r.walletDebiter
		r.mu.RUnlock()
		gw, err := buildWallet(*m, debiter)
		if err != nil {
			return nil, fmt.Errorf("%w: %s: %v", ErrInvalidConfig, code, err)
		}
		return gw, nil
	}

	r.mu.RLock()
	builder, ok := r.builders[code]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrGatewayNotFound, code)
	}
	gw, err := builder(*m)
	if err != nil {
		return nil, fmt.Errorf("%w: %s: %v", ErrInvalidConfig, code, err)
	}
	return gw, nil
}

// ListEnabled — enabled + registered gateways, siap dipakai wizard checkout.
// Config di-mask (ListEnabled dari repo sudah mask). Return sorted per
// payments.sort_order.
func (r *Registry) ListEnabled(ctx context.Context) ([]Gateway, error) {
	items, err := r.repo.ListEnabled(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Gateway, 0, len(items))
	for _, m := range items {
		// Special case: deposit_wallet — check debiter injected + build.
		if m.Code == payments.CodeDepositWallet {
			r.mu.RLock()
			debiter := r.walletDebiter
			r.mu.RUnlock()
			if debiter == nil {
				continue // wallet gateway not available — skip silent
			}
			gw, err := buildWallet(m, debiter)
			if err == nil {
				out = append(out, gw)
			}
			continue
		}

		r.mu.RLock()
		builder, ok := r.builders[m.Code]
		r.mu.RUnlock()
		if !ok {
			// Payment method enabled di DB tapi tidak ada Builder — skip
			// dengan silent (admin nanti tahu dari absence di UI).
			continue
		}
		gw, err := builder(m)
		if err != nil {
			// Config invalid — skip. Admin lihat di admin panel.
			continue
		}
		out = append(out, gw)
	}
	return out, nil
}

// mustParseConfig — helper untuk gateway Builder. Unmarshal ke concrete
// config struct atau return ErrInvalidConfig dengan pesan detail.
func mustParseConfig(code string, raw json.RawMessage, target any) error {
	if len(raw) == 0 || string(raw) == "null" {
		raw = json.RawMessage("{}")
	}
	if err := json.Unmarshal(raw, target); err != nil {
		return fmt.Errorf("%s: unmarshal config: %w", code, err)
	}
	return nil
}
