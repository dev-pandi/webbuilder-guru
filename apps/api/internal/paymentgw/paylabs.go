package paymentgw

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/webbuilder/api/internal/payments"
)

// PaylabsGateway — implementasi Paylabs payment gateway (paylabs.co.id).
//
// Reference API: <https://docs.paylabs.co.id/>
//
// Flow:
//   1. CreateCharge → POST /payment/v2.1/vaddress/create (atau QRIS/Snap
//      product sesuai config `channel`). Paylabs return `paymentUrl` +
//      `paymentId` untuk track.
//   2. User bayar via redirect / VA channel.
//   3. Paylabs POST notification ke NotifURL dengan signature di header
//      `X-SIGNATURE` — HMAC-SHA256 dari body + timestamp + api_key.
//
// Config JSONB:
//
//	{
//	  "merchant_id":   "MC-abc123",        // credential
//	  "api_key":       "sk_live_xxx",      // credential — secret key
//	  "endpoint":      "https://api.paylabs.co.id",  // production endpoint
//	  "channel":       "va"                // "va" | "qris" | "cc" | "snap" (default: "snap")
//	}
//
// Note: Paylabs punya multiple product (VA, QRIS, Snap unified). Untuk MVP
// default ke Snap (unified checkout). Consumer bisa override `channel`
// di config kalau butuh spesifik.
type PaylabsGateway struct {
	code   string
	label  string
	config paylabsConfig
	http   *http.Client
}

type paylabsConfig struct {
	MerchantID string `json:"merchant_id"`
	APIKey     string `json:"api_key"`
	Endpoint   string `json:"endpoint"`
	Channel    string `json:"channel"`
}

func buildPaylabs(m payments.PaymentMethod) (Gateway, error) {
	var cfg paylabsConfig
	if err := mustParseConfig(m.Code, m.Config, &cfg); err != nil {
		return nil, err
	}
	if cfg.MerchantID == "" || cfg.APIKey == "" {
		return nil, fmt.Errorf("merchant_id dan api_key wajib")
	}
	if cfg.Endpoint == "" {
		cfg.Endpoint = "https://api.paylabs.co.id"
	}
	if cfg.Channel == "" {
		cfg.Channel = "snap"
	}
	return &PaylabsGateway{
		code:   m.Code,
		label:  m.Label,
		config: cfg,
		http:   &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (g *PaylabsGateway) Code() string  { return g.code }
func (g *PaylabsGateway) Label() string { return g.label }
func (g *PaylabsGateway) Type() string  { return payments.TypeGateway }

// paylabsCreateReq — payload untuk create transaksi.
// Field naming mengikuti Paylabs API v2.1 convention (camelCase).
type paylabsCreateReq struct {
	MerchantID    string          `json:"merchantId"`
	RequestID     string          `json:"requestId"`       // idempotency key, = OrderID
	Amount        int64           `json:"amount"`
	Currency      string          `json:"currency"`
	OrderID       string          `json:"orderId"`         // = invoice.id
	Description   string          `json:"description,omitempty"`
	NotifyURL     string          `json:"notifyUrl,omitempty"`
	ReturnURL     string          `json:"returnUrl,omitempty"`
	ExpireTime    string          `json:"expireTime,omitempty"` // RFC3339
	Customer      paylabsCustomer `json:"customer,omitempty"`
	Channel       string          `json:"paymentType,omitempty"` // "snap"|"va"|"qris"|"cc"
}

type paylabsCustomer struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`
}

// paylabsCreateResp — response shape.
type paylabsCreateResp struct {
	Success      bool   `json:"success"`
	PaymentID    string `json:"paymentId,omitempty"`     // provider ref
	PaymentURL   string `json:"paymentUrl,omitempty"`    // redirect target
	QRString     string `json:"qrString,omitempty"`      // untuk QRIS channel
	VaNumber     string `json:"vaNumber,omitempty"`      // untuk VA channel
	ExpireTime   string `json:"expireTime,omitempty"`    // RFC3339
	ErrorCode    string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// CreateCharge — POST ke Paylabs. Return PaymentURL + ProviderRefID.
func (g *PaylabsGateway) CreateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount harus > 0")
	}
	if req.OrderID == "" {
		return nil, fmt.Errorf("order_id wajib")
	}

	currency := req.Currency
	if currency == "" {
		currency = "IDR"
	}

	body := paylabsCreateReq{
		MerchantID:  g.config.MerchantID,
		RequestID:   req.OrderID,
		Amount:      req.Amount,
		Currency:    currency,
		OrderID:     req.OrderID,
		Description: truncate(req.Description, 200),
		NotifyURL:   req.NotifURL,
		ReturnURL:   req.ReturnURL,
		Customer: paylabsCustomer{
			Name:  req.Customer.Name,
			Email: req.Customer.Email,
			Phone: req.Customer.Phone,
		},
		Channel: g.config.Channel,
	}
	if !req.ExpiresAt.IsZero() {
		body.ExpireTime = req.ExpiresAt.UTC().Format(time.RFC3339)
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	timestamp := time.Now().UTC().Format(time.RFC3339)
	signature := computePaylabsSig(payload, timestamp, g.config.APIKey)

	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		strings.TrimRight(g.config.Endpoint, "/")+"/payment/v2.1/create", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-TIMESTAMP", timestamp)
	httpReq.Header.Set("X-SIGNATURE", signature)
	httpReq.Header.Set("X-PARTNER-ID", g.config.MerchantID)

	resp, err := g.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("paylabs dial: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var out paylabsCreateResp
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("paylabs decode: %w (body: %s)", err, respBody)
	}

	if resp.StatusCode >= 400 || !out.Success {
		msg := out.ErrorMessage
		if msg == "" {
			msg = string(respBody)
		}
		return nil, fmt.Errorf("paylabs http %d [%s]: %s", resp.StatusCode, out.ErrorCode, msg)
	}
	if out.PaymentID == "" {
		return nil, fmt.Errorf("paylabs response missing paymentId: %s", respBody)
	}

	// PaymentURL kosong = QRIS-only (kembalikan qrString). Consumer bisa
	// render QR di frontend.
	var expiresAt time.Time
	if out.ExpireTime != "" {
		if t, err := time.Parse(time.RFC3339, out.ExpireTime); err == nil {
			expiresAt = t
		}
	}
	if expiresAt.IsZero() {
		expiresAt = req.ExpiresAt
	}

	return &ChargeResponse{
		ProviderRefID: out.PaymentID,
		PaymentURL:    out.PaymentURL,
		QRString:      out.QRString,
		ExpiresAt:     expiresAt,
	}, nil
}

// paylabsWebhookPayload — subset field yang kita butuh dari notification.
type paylabsWebhookPayload struct {
	MerchantID   string `json:"merchantId"`
	PaymentID    string `json:"paymentId"`     // provider ref
	OrderID      string `json:"orderId"`
	Amount       int64  `json:"amount"`
	Currency     string `json:"currency"`
	Status       string `json:"status"`        // "SUCCESS" | "PENDING" | "FAILED" | "EXPIRED"
	PaymentTime  string `json:"paymentTime,omitempty"` // RFC3339
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// HandleWebhook — verify signature + parse event.
//
// Paylabs signature scheme: `X-SIGNATURE` header berisi HMAC-SHA256 dari
// body + timestamp (via header X-TIMESTAMP) + api_key. Kita re-compute
// dari body + timestamp yang di-attach, compare dengan header value.
func (g *PaylabsGateway) HandleWebhook(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error) {
	sig := headers["X-Signature"]
	if sig == "" {
		sig = headers["X-SIGNATURE"]
	}
	ts := headers["X-Timestamp"]
	if ts == "" {
		ts = headers["X-TIMESTAMP"]
	}
	if sig == "" || ts == "" {
		return nil, ErrInvalidSignature
	}

	expected := computePaylabsSig(body, ts, g.config.APIKey)
	if !strings.EqualFold(sig, expected) {
		return nil, ErrInvalidSignature
	}

	var p paylabsWebhookPayload
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, fmt.Errorf("paylabs webhook decode: %w", err)
	}

	status := mapPaylabsStatus(p.Status)
	var paidAt time.Time
	if p.PaymentTime != "" {
		if t, err := time.Parse(time.RFC3339, p.PaymentTime); err == nil {
			paidAt = t
		}
	}

	return &WebhookEvent{
		ProviderRefID: p.PaymentID,
		OrderID:       p.OrderID,
		Status:        status,
		Amount:        p.Amount,
		PaidAt:        paidAt,
		RawPayload:    body,
	}, nil
}

// computePaylabsSig — HMAC-SHA256 dari `body + "\n" + timestamp + "\n" + api_key`.
// Format ini adaptasi dari Paylabs docs (byte-level compare).
//
// Kalau customer punya API version yang berbeda scheme, adjust di sini.
func computePaylabsSig(body []byte, timestamp, apiKey string) string {
	h := sha256.New()
	h.Write(body)
	h.Write([]byte{'\n'})
	h.Write([]byte(timestamp))
	h.Write([]byte{'\n'})
	h.Write([]byte(apiKey))
	return hex.EncodeToString(h.Sum(nil))
}

// mapPaylabsStatus — Paylabs status → normalized enum.
func mapPaylabsStatus(s string) Status {
	switch strings.ToUpper(s) {
	case "SUCCESS", "PAID", "COMPLETED":
		return StatusSuccess
	case "PENDING", "PROCESSING":
		return StatusPending
	case "FAILED", "REJECTED", "CANCELLED":
		return StatusFailed
	case "EXPIRED", "TIMEOUT":
		return StatusExpired
	case "REFUND", "REFUNDED":
		return StatusRefund
	}
	return StatusPending
}
