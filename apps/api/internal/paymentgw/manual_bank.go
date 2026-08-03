package paymentgw

import (
	"context"
	"fmt"
	"strings"

	"github.com/webbuilder/api/internal/payments"
)

// ManualBankGateway — pembayaran manual via transfer bank. Tidak ada
// external API. CreateCharge return Instructions (bank list + no ref number).
// Webhook tidak didukung — admin verify manual via UI (endpoint terpisah,
// bukan gateway concern).
//
// Config JSONB:
//
//	{
//	  "banks": [
//	    {"name":"BCA", "account_number":"1234567890", "account_holder":"PT Web Builder"},
//	    {"name":"Mandiri", "account_number":"0987654321", "account_holder":"PT Web Builder"}
//	  ],
//	  "instructions_md": "Setelah transfer, upload bukti transfer di dashboard."
//	}
type ManualBankGateway struct {
	code   string
	label  string
	config manualBankConfig
}

type manualBankAccount struct {
	Name          string `json:"name"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
}

type manualBankConfig struct {
	Banks           []manualBankAccount `json:"banks"`
	InstructionsMD  string              `json:"instructions_md"`
}

// buildManualBank — Builder factory dipakai Registry.
func buildManualBank(m payments.PaymentMethod) (Gateway, error) {
	var cfg manualBankConfig
	if err := mustParseConfig(m.Code, m.Config, &cfg); err != nil {
		return nil, err
	}
	// Sanity — kalau admin lupa isi banks, gateway tetap functional tapi
	// instruksi warn user. Bukan hard error supaya toggle enable-first,
	// isi-config-later workflow tetap bisa.
	return &ManualBankGateway{
		code:   m.Code,
		label:  m.Label,
		config: cfg,
	}, nil
}

func (g *ManualBankGateway) Code() string  { return g.code }
func (g *ManualBankGateway) Label() string { return g.label }
func (g *ManualBankGateway) Type() string  { return payments.TypeManual }

// CreateCharge — bangun instruction text dari banks list + admin instructions.
// Tidak call external API. ProviderRefID = OrderID (invoice) supaya
// downstream reconcile.
func (g *ManualBankGateway) CreateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount harus > 0")
	}
	if req.OrderID == "" {
		return nil, fmt.Errorf("order_id wajib")
	}
	instructions := buildManualInstructions(g.config, req)
	return &ChargeResponse{
		ProviderRefID: req.OrderID, // manual = pakai order id sendiri
		PaymentURL:    "",           // no redirect
		ExpiresAt:     req.ExpiresAt,
		Instructions:  instructions,
	}, nil
}

// HandleWebhook — manual bank tidak punya webhook. Admin verify via UI
// (endpoint `POST /admin/invoices/:id/mark-paid`). Return ErrUnsupported
// supaya router bisa 404 kalau ada request nyasar ke `/webhooks/payment/manual_bank`.
func (g *ManualBankGateway) HandleWebhook(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error) {
	return nil, ErrUnsupported
}

// buildManualInstructions — assemble markdown untuk display di UI +
// email confirmation.
func buildManualInstructions(cfg manualBankConfig, req ChargeRequest) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("**Tagihan**: Rp %s\n", formatIDR(req.Amount)))
	if req.Description != "" {
		b.WriteString(fmt.Sprintf("**Untuk**: %s\n\n", req.Description))
	}
	if len(cfg.Banks) == 0 {
		b.WriteString("_Rekening bank belum di-set oleh admin. Silakan hubungi support._\n")
	} else {
		b.WriteString("**Transfer ke salah satu rekening berikut**:\n\n")
		for _, bank := range cfg.Banks {
			b.WriteString(fmt.Sprintf("- **%s** — %s a.n. %s\n",
				bank.Name, bank.AccountNumber, bank.AccountHolder))
		}
	}
	b.WriteString(fmt.Sprintf("\n**Berita transfer**: `%s` (WAJIB — supaya kami bisa match pembayaran otomatis)\n",
		req.OrderID))
	if cfg.InstructionsMD != "" {
		b.WriteString("\n---\n")
		b.WriteString(cfg.InstructionsMD)
	}
	return b.String()
}

// formatIDR — format 12000000 → "12.000.000". Simple thousand separator.
func formatIDR(amount int64) string {
	s := fmt.Sprintf("%d", amount)
	if len(s) <= 3 {
		return s
	}
	// Insert dots dari kanan tiap 3 digit.
	var out strings.Builder
	pre := len(s) % 3
	if pre > 0 {
		out.WriteString(s[:pre])
		if len(s) > pre {
			out.WriteByte('.')
		}
	}
	for i := pre; i < len(s); i += 3 {
		out.WriteString(s[i : i+3])
		if i+3 < len(s) {
			out.WriteByte('.')
		}
	}
	return out.String()
}
