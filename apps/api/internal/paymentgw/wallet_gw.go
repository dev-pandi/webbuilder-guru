package paymentgw

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/payments"
)

// WalletGateway — synchronous "gateway" yang debit balance wallet internal
// user. Beda dari Midtrans/Paylabs:
//   - Tidak ada external HTTP call
//   - Tidak ada webhook (HandleWebhook return ErrUnsupported)
//   - Charge = sync debit di ChargeRequest time; balance harus cukup
//   - ProviderRefID = ledger entry id (untuk audit)
//
// Consumer (domain_purchase.PurchaseV2) detect gateway type via `gw.Type()`
// == "wallet" → treat charge sebagai final payment (mark invoice paid
// langsung + trigger EPP execute synchronous), bukan wait webhook.
//
// Config JSONB (di payment_methods table):
//
//	{
//	  "topup_min":   100000,     // batas minimal topup (dipakai future topup flow)
//	  "topup_max":   100000000
//	}
//
// (Config di-parse tapi tidak dipakai gateway langsung — dipakai future
// topup handler.)
type WalletGateway struct {
	code    string
	label   string
	debiter WalletDebiter
}

// WalletDebiter — abstraksi debit wallet. Diimplementasikan oleh
// `wallet_local.Repo.Debit` via adapter (di main.go untuk avoid import cycle).
type WalletDebiter interface {
	Debit(ctx context.Context, in WalletDebitInput) (ledgerID uuid.UUID, err error)
}

// WalletDebitInput — subset dari wallet_local.DebitInput. Direplicate di
// package ini untuk avoid cross-package coupling (wallet_local tidak boleh
// depend ke paymentgw dan vice-versa).
type WalletDebitInput struct {
	UserID      uuid.UUID
	Amount      int64
	Reason      string     // "debit_register" | "debit_renew"
	ReferenceID *uuid.UUID // invoice_id
	Metadata    []byte     // JSON, disimpan di wallet_ledger.metadata
}

// ErrWalletInsufficient — return kalau saldo user < amount. Diperiksa
// consumer (PurchaseV2) untuk return 402 spesifik.
var ErrWalletInsufficient = errors.New("saldo wallet tidak cukup")

// buildWallet — factory dipakai Registry saat resolve `deposit_wallet` code.
// Butuh WalletDebiter yang di-inject terpisah via Registry.SetWalletDebiter
// karena Debiter tidak bisa di-build dari PaymentMethod.config aja.
func buildWallet(m payments.PaymentMethod, debiter WalletDebiter) (Gateway, error) {
	if debiter == nil {
		return nil, fmt.Errorf("%w: WalletDebiter tidak wired di Registry", ErrInvalidConfig)
	}
	// Config saat ini tidak di-parse — reserved untuk future (topup_min/max).
	return &WalletGateway{
		code:    m.Code,
		label:   m.Label,
		debiter: debiter,
	}, nil
}

func (g *WalletGateway) Code() string  { return g.code }
func (g *WalletGateway) Label() string { return g.label }
func (g *WalletGateway) Type() string  { return payments.TypeWallet }

// CreateCharge — sync debit. Kalau balance tidak cukup, return
// ErrWalletInsufficient supaya caller bisa render pesan spesifik ke user.
//
// ProviderRefID = ledger.id string (untuk audit trail + idempotency
// verification kalau webhook double-fire, meskipun wallet tidak punya webhook).
func (g *WalletGateway) CreateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount harus > 0")
	}
	if req.OrderID == "" {
		return nil, fmt.Errorf("order_id wajib")
	}
	// Prefer WalletPayerID (explicit debit target, mis. agent → reseller).
	// Fallback ke UserID untuk backward compat (self-purchase reseller).
	payerRaw := req.WalletPayerID
	if payerRaw == "" {
		payerRaw = req.UserID
	}
	if payerRaw == "" {
		return nil, fmt.Errorf("wallet_payer_id / user_id wajib untuk wallet gateway")
	}
	uid, err := uuid.Parse(payerRaw)
	if err != nil {
		return nil, fmt.Errorf("wallet payer bukan UUID valid: %w", err)
	}
	// OrderID = invoice.id — dipakai sebagai reference_id di ledger untuk
	// audit (link ledger entry ↔ invoice).
	orderUUID, err := uuid.Parse(req.OrderID)
	if err != nil {
		// Non-fatal — reference_id nullable di ledger. Log + continue tanpa ref.
		orderUUID = uuid.Nil
	}

	// Reason string default — caller bisa override via metadata kalau perlu.
	// Untuk domain_purchase, kita default "debit_register". Renew case:
	// caller pass separate reason? Untuk MVP hardcode "debit_register" —
	// domain_purchase.PurchaseV2 pakai gateway ini untuk register only;
	// renew flow di RenewV2 nanti pakai reason "debit_renew" (via
	// dedicated interface method kalau perlu).
	reason := "debit_register"

	debitIn := WalletDebitInput{
		UserID:   uid,
		Amount:   req.Amount,
		Reason:   reason,
		Metadata: req.WalletMetadata,
	}
	if orderUUID != uuid.Nil {
		debitIn.ReferenceID = &orderUUID
	}

	ledgerID, err := g.debiter.Debit(ctx, debitIn)
	if err != nil {
		// Translate "saldo tidak cukup" ke error yang consumer bisa match.
		if isInsufficientErr(err) {
			return nil, ErrWalletInsufficient
		}
		return nil, fmt.Errorf("wallet debit: %w", err)
	}

	return &ChargeResponse{
		ProviderRefID: ledgerID.String(),
		PaymentURL:    "", // sync — no redirect
		Instructions:  "Saldo wallet berhasil di-debit. Domain akan segera aktif.",
	}, nil
}

// HandleWebhook — wallet tidak punya webhook. Return ErrUnsupported
// supaya router 404 kalau ada request nyasar.
func (g *WalletGateway) HandleWebhook(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error) {
	return nil, ErrUnsupported
}

// isInsufficientErr — heuristic detection. Debiter impl (wallet_local)
// pakai `wallet_local.ErrInsufficient`. Kita tidak import wallet_local
// (avoid cross-package coupling), pattern-match string message.
//
// Kalau debiter impl beda, method ini masih return false → error
// propagate ke caller as generic — consumer masih bisa match via
// substring atau lewat original err.
func isInsufficientErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, marker := range []string{"insufficient", "tidak cukup"} {
		if containsFold(msg, marker) {
			return true
		}
	}
	return false
}

// containsFold — case-insensitive substring check tanpa import strings.ToLower
// (kecil-efisien di hot path yang jarang).
func containsFold(s, substr string) bool {
	if len(substr) > len(s) {
		return false
	}
	// Simple lowering — safe untuk ASCII markers ("insufficient", "tidak cukup").
	// UTF-8 non-ASCII marker akan miss, tapi kita tidak pakai.
	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			a, b := s[i+j], substr[j]
			if a >= 'A' && a <= 'Z' {
				a += 'a' - 'A'
			}
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if a != b {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
