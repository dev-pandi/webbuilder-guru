package paymentgw

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/webbuilder/api/internal/payments"
)

// MidtransGateway — implementasi Midtrans Snap API.
//
// Flow:
//   1. CreateCharge → POST /snap/v1/transactions ke Midtrans → return
//      redirect_url (SnapURL yang user buka untuk pilih channel bayar).
//   2. User bayar via Snap page.
//   3. Midtrans POST notification ke NotifURL → HandleWebhook verify
//      signature (SHA512 dari order_id+status_code+gross_amount+server_key).
//
// Config JSONB:
//
//	{
//	  "server_key":     "SB-Mid-server-xxx",  // credential — NEVER expose ke public
//	  "client_key":     "SB-Mid-client-yyy",  // client-side (OK di frontend, kita cukup simpan)
//	  "is_production":  false,                 // sandbox vs production endpoint
//	  "snap_url":       "https://app.sandbox.midtrans.com/snap/v1/transactions" // auto-derive kalau kosong
//	}
type MidtransGateway struct {
	code   string
	label  string
	config midtransConfig
	http   *http.Client
}

type midtransConfig struct {
	ServerKey    string `json:"server_key"`
	ClientKey    string `json:"client_key"`
	IsProduction bool   `json:"is_production"`
	SnapURL      string `json:"snap_url"` // opsional; kalau kosong derive dari is_production
}

func buildMidtrans(m payments.PaymentMethod) (Gateway, error) {
	var cfg midtransConfig
	if err := mustParseConfig(m.Code, m.Config, &cfg); err != nil {
		return nil, err
	}
	if cfg.ServerKey == "" {
		return nil, fmt.Errorf("server_key wajib")
	}
	if cfg.SnapURL == "" {
		if cfg.IsProduction {
			cfg.SnapURL = "https://app.midtrans.com/snap/v1/transactions"
		} else {
			cfg.SnapURL = "https://app.sandbox.midtrans.com/snap/v1/transactions"
		}
	}
	return &MidtransGateway{
		code:   m.Code,
		label:  m.Label,
		config: cfg,
		http:   &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (g *MidtransGateway) Code() string  { return g.code }
func (g *MidtransGateway) Label() string { return g.label }
func (g *MidtransGateway) Type() string  { return payments.TypeGateway }

// snapReq / snapResp — shape sesuai Midtrans Snap API v1.
type snapReq struct {
	TransactionDetails snapTxnDetails `json:"transaction_details"`
	CustomerDetails    snapCustomer   `json:"customer_details,omitempty"`
	ItemDetails        []snapItem     `json:"item_details,omitempty"`
	Callbacks          *snapCallbacks `json:"callbacks,omitempty"`
	Expiry             *snapExpiry    `json:"expiry,omitempty"`
}

type snapTxnDetails struct {
	OrderID     string `json:"order_id"`
	GrossAmount int64  `json:"gross_amount"`
}

type snapCustomer struct {
	FirstName string `json:"first_name,omitempty"`
	Email     string `json:"email,omitempty"`
	Phone     string `json:"phone,omitempty"`
}

type snapItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Price    int64  `json:"price"`
	Quantity int    `json:"quantity"`
}

type snapCallbacks struct {
	Finish string `json:"finish,omitempty"`
}

type snapExpiry struct {
	Duration int    `json:"duration"`
	Unit     string `json:"unit"` // "minute" | "hour" | "day"
}

type snapResp struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
	// Error case
	ErrorMessages []string `json:"error_messages,omitempty"`
	StatusCode    string   `json:"status_code,omitempty"`
}

// CreateCharge — POST ke Snap. Return redirect_url + expiry.
func (g *MidtransGateway) CreateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount harus > 0")
	}
	if req.OrderID == "" {
		return nil, fmt.Errorf("order_id wajib")
	}
	body := snapReq{
		TransactionDetails: snapTxnDetails{
			OrderID:     req.OrderID,
			GrossAmount: req.Amount,
		},
		CustomerDetails: snapCustomer{
			FirstName: req.Customer.Name,
			Email:     req.Customer.Email,
			Phone:     req.Customer.Phone,
		},
	}
	if req.Description != "" {
		// Item details wajib total = gross_amount supaya Snap tidak reject.
		body.ItemDetails = []snapItem{{
			ID:       req.OrderID,
			Name:     truncate(req.Description, 50), // Midtrans limit 50 char
			Price:    req.Amount,
			Quantity: 1,
		}}
	}
	if req.ReturnURL != "" {
		body.Callbacks = &snapCallbacks{Finish: req.ReturnURL}
	}
	if !req.ExpiresAt.IsZero() {
		mins := int(time.Until(req.ExpiresAt).Minutes())
		if mins < 1 {
			mins = 1
		}
		body.Expiry = &snapExpiry{Duration: mins, Unit: "minute"}
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, "POST", g.config.SnapURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	// Basic auth: server_key + ":" base64-encoded.
	auth := base64.StdEncoding.EncodeToString([]byte(g.config.ServerKey + ":"))
	httpReq.Header.Set("Authorization", "Basic "+auth)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := g.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("midtrans dial: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		var e snapResp
		_ = json.Unmarshal(respBody, &e)
		return nil, fmt.Errorf("midtrans http %d: %s", resp.StatusCode,
			strings.Join(e.ErrorMessages, "; "))
	}

	var out snapResp
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("midtrans decode: %w", err)
	}
	if out.Token == "" || out.RedirectURL == "" {
		return nil, fmt.Errorf("midtrans response invalid: %s", respBody)
	}

	return &ChargeResponse{
		ProviderRefID: out.Token,
		PaymentURL:    out.RedirectURL,
		ExpiresAt:     req.ExpiresAt,
	}, nil
}

// midtransWebhookPayload — subset field yang kita butuh dari notification.
type midtransWebhookPayload struct {
	OrderID           string `json:"order_id"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"` // string di Midtrans, "12345.00"
	TransactionID     string `json:"transaction_id"`
	TransactionTime   string `json:"transaction_time"` // "2025-01-15 14:30:00"
	SignatureKey      string `json:"signature_key"`
}

// HandleWebhook — verify signature (SHA512 dari order_id+status_code+
// gross_amount+server_key) + map ke normalized Status.
func (g *MidtransGateway) HandleWebhook(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error) {
	var p midtransWebhookPayload
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, fmt.Errorf("midtrans webhook decode: %w", err)
	}

	// Signature: sha512(order_id + status_code + gross_amount + server_key).
	expectedSig := computeMidtransSig(p.OrderID, p.StatusCode, p.GrossAmount, g.config.ServerKey)
	if !strings.EqualFold(p.SignatureKey, expectedSig) {
		return nil, ErrInvalidSignature
	}

	status := mapMidtransStatus(p.TransactionStatus, p.FraudStatus)
	amount := parseGrossAmount(p.GrossAmount)

	var paidAt time.Time
	if p.TransactionTime != "" {
		// Midtrans pakai zona WIB (UTC+7). Parse pakai layout tanpa TZ +
		// asumsi WIB untuk consistency (invoice storage biasanya UTC).
		if t, err := time.ParseInLocation("2006-01-02 15:04:05", p.TransactionTime,
			time.FixedZone("WIB", 7*3600)); err == nil {
			paidAt = t
		}
	}

	return &WebhookEvent{
		ProviderRefID: p.TransactionID,
		OrderID:       p.OrderID,
		Status:        status,
		Amount:        amount,
		PaidAt:        paidAt,
		RawPayload:    body,
	}, nil
}

// computeMidtransSig — spec dari Midtrans docs.
func computeMidtransSig(orderID, statusCode, grossAmount, serverKey string) string {
	h := sha512.New()
	h.Write([]byte(orderID + statusCode + grossAmount + serverKey))
	return hex.EncodeToString(h.Sum(nil))
}

// mapMidtransStatus — 8+ transaction_status values di Midtrans → 5 normalized.
// Reference: https://docs.midtrans.com/en/after-payment/http-notification#status-value-definitions
func mapMidtransStatus(txnStatus, fraudStatus string) Status {
	switch txnStatus {
	case "capture":
		// Credit card capture — success kalau fraud check passed.
		if fraudStatus == "accept" {
			return StatusSuccess
		}
		return StatusPending
	case "settlement":
		return StatusSuccess
	case "pending":
		return StatusPending
	case "deny", "cancel":
		return StatusFailed
	case "expire":
		return StatusExpired
	case "refund", "partial_refund", "chargeback", "partial_chargeback":
		return StatusRefund
	case "authorize":
		// Card authorized, pending capture — masih menunggu.
		return StatusPending
	}
	return StatusPending
}

// parseGrossAmount — Midtrans kirim "12345.00" → 12345.
// Tidak butuh precision decimal (IDR minor unit selalu int).
func parseGrossAmount(s string) int64 {
	// Cut ".00" suffix kalau ada.
	if i := strings.Index(s, "."); i > 0 {
		s = s[:i]
	}
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}

// truncate — utility untuk field yang punya length cap (Midtrans item name = 50).
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
