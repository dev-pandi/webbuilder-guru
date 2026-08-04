// Package paymentgw — abstraksi payment gateway supaya konsumer
// (domain_purchase, invoices) tidak coupling ke Midtrans/Paylabs SDK
// spesifik. Registry lookup by code, config di-inject dari
// `payment_methods.config` JSONB.
//
// Flow standar checkout:
//
//	gw := registry.Get("midtrans")
//	res, _ := gw.CreateCharge(ctx, ChargeRequest{OrderID: invoiceID, Amount: 12000000, ...})
//	// Redirect user ke res.PaymentURL
//	// ... user bayar ...
//	// Provider POST webhook ke /webhooks/payment/:code
//	event, _ := gw.HandleWebhook(ctx, headers, body)
//	// event.Status = 'success' → mark invoice paid → execute EPP register
//
// Konvensi:
//   - Amount = IDR minor unit (Rupiah utuh, tidak ada cent).
//   - Currency selalu "IDR" untuk MVP.
//   - OrderID = invoice.id UUID string (invoice adalah source-of-truth,
//     provider hanya wrapper).
package paymentgw

import (
	"context"
	"errors"
	"time"
)

// Standard errors — konsumer pattern-match dengan errors.Is.
var (
	// ErrGatewayNotFound — code tidak terdaftar di registry (mis. admin
	// belum enable, atau typo code).
	ErrGatewayNotFound = errors.New("payment gateway tidak terdaftar")
	// ErrGatewayDisabled — gateway ada tapi disabled di payment_methods.
	ErrGatewayDisabled = errors.New("payment gateway disabled")
	// ErrInvalidConfig — config JSONB tidak sesuai schema per code.
	ErrInvalidConfig = errors.New("payment gateway config tidak valid")
	// ErrInvalidSignature — webhook signature verify gagal.
	ErrInvalidSignature = errors.New("webhook signature tidak valid")
	// ErrUnsupported — operation tidak didukung oleh gateway (mis. wallet
	// tidak butuh payment URL).
	ErrUnsupported = errors.New("operasi tidak didukung oleh gateway")
)

// Status — normalized event status. Kalau provider punya status yang tidak
// map ke sini, gateway impl decide mapping ke terminal state terdekat.
type Status string

const (
	StatusPending Status = "pending"  // menunggu user aksi (bayar)
	StatusSuccess Status = "success"  // paid — invoice bisa di-mark paid
	StatusFailed  Status = "failed"   // rejected — terminal, user harus retry
	StatusExpired Status = "expired"  // window habis — terminal
	StatusRefund  Status = "refund"   // di-refund (rare)
)

// Customer — data user untuk gateway (kirim ke Midtrans/Paylabs supaya
// tampil di dashboard mereka + auto-fill di form).
type Customer struct {
	Name  string
	Email string
	Phone string
}

// ChargeRequest — payload create transaksi. Amount = IDR minor unit.
type ChargeRequest struct {
	OrderID     string    // invoice.id UUID string
	UserID      string    // user.id UUID string — customer identity untuk gateway
	                      // eksternal. Untuk wallet gateway, WalletPayerID lebih
	                      // authoritative (kalau kosong, fallback ke UserID).
	Amount      int64     // IDR utuh (min 10000 biasanya per gateway policy)
	Currency    string    // "IDR" untuk MVP
	Description string    // "Domain myshop.id 1 tahun" — tampil di UI + email
	Customer    Customer  // billing info
	ReturnURL   string    // web builder redirect setelah user selesai bayar
	NotifURL    string    // gateway callback URL — biasanya `/webhooks/payment/:code`
	ExpiresAt   time.Time // opsional, kosong = pakai default gateway

	// WalletPayerID — override target debit untuk WalletGateway. Dipakai
	// buat kasus agent: caller.ID = agent, tapi wallet yang di-debit =
	// parent reseller. Kalau kosong, wallet gateway fallback ke UserID.
	WalletPayerID string
	// WalletMetadata — JSON attached ke wallet_ledger.metadata. Reseller
	// pakai ini buat report per-agent (mis. {"agent_id":"<uuid>"}).
	WalletMetadata []byte
}

// ChargeResponse — hasil create transaksi.
type ChargeResponse struct {
	ProviderRefID string    // ID transaksi di gateway (Midtrans transaction_id)
	PaymentURL    string    // redirect target (Snap URL, Paylabs redirect)
	ExpiresAt     time.Time // real expiry dari gateway
	Instructions  string    // untuk manual bank: "Transfer ke BCA 123..." — markdown OK
	QRString      string    // opsional, kalau gateway support QRIS
}

// WebhookEvent — normalized event dari callback provider.
type WebhookEvent struct {
	ProviderRefID string     // match ke ChargeResponse.ProviderRefID
	OrderID       string     // invoice.id
	Status        Status     // normalized
	Amount        int64      // paid amount (biasanya sama dengan invoice, tapi
	// verify untuk cegah partial-payment abuse)
	PaidAt        time.Time  // waktu payment (dari provider)
	RawPayload    []byte     // untuk audit + replay
}

// Gateway — kontrak abstrak. Setiap payment method (Midtrans, Paylabs,
// manual_bank, wallet) implement interface ini.
type Gateway interface {
	Code() string
	Label() string
	Type() string // "gateway" | "manual" | "wallet"

	// CreateCharge — bikin transaksi + return payment URL / instructions.
	// Gateway impl decide: online (Midtrans/Paylabs) return PaymentURL,
	// manual return Instructions + zero PaymentURL.
	CreateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error)

	// HandleWebhook — verify signature + parse event body. Return normalized
	// WebhookEvent. Kalau signature gagal, return ErrInvalidSignature.
	// Kalau gateway tidak support webhook (mis. manual bank), return
	// ErrUnsupported — admin verify manual via UI, bukan webhook.
	HandleWebhook(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error)
}
