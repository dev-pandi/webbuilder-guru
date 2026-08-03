package paymentgw

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/webbuilder/api/internal/payments"
)

func TestFormatIDR(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0"},
		{100, "100"},
		{999, "999"},
		{1000, "1.000"},
		{12345, "12.345"},
		{1000000, "1.000.000"},
		{12345678, "12.345.678"},
	}
	for _, tc := range cases {
		if got := formatIDR(tc.in); got != tc.want {
			t.Errorf("formatIDR(%d) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestManualBank_CreateCharge_BuildsInstructions(t *testing.T) {
	cfg, _ := json.Marshal(manualBankConfig{
		Banks: []manualBankAccount{
			{Name: "BCA", AccountNumber: "1234567890", AccountHolder: "PT Web Builder"},
			{Name: "Mandiri", AccountNumber: "0987654321", AccountHolder: "PT Web Builder"},
		},
		InstructionsMD: "Setelah transfer, upload bukti di dashboard.",
	})
	gw, err := buildManualBank(payments.PaymentMethod{
		Code:   payments.CodeManualBank,
		Label:  "Transfer Bank Manual",
		Type:   payments.TypeManual,
		Config: cfg,
	})
	if err != nil {
		t.Fatalf("buildManualBank: %v", err)
	}

	res, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID:     "INV-2026-000123",
		Amount:      250000,
		Currency:    "IDR",
		Description: "Domain myshop.id 1 tahun",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	})
	if err != nil {
		t.Fatalf("CreateCharge: %v", err)
	}

	// PaymentURL empty (manual, no redirect).
	if res.PaymentURL != "" {
		t.Errorf("PaymentURL should be empty for manual, got %q", res.PaymentURL)
	}
	// Instructions harus include amount, banks, order_id sebagai berita.
	instr := res.Instructions
	if !strings.Contains(instr, "250.000") {
		t.Errorf("instructions missing formatted amount: %s", instr)
	}
	if !strings.Contains(instr, "BCA") || !strings.Contains(instr, "1234567890") {
		t.Errorf("instructions missing bank info: %s", instr)
	}
	if !strings.Contains(instr, "INV-2026-000123") {
		t.Errorf("instructions missing order_id as berita transfer: %s", instr)
	}
	if !strings.Contains(instr, "Setelah transfer") {
		t.Errorf("instructions missing admin markdown: %s", instr)
	}
	// ProviderRefID = OrderID (manual doesn't have external ref).
	if res.ProviderRefID != "INV-2026-000123" {
		t.Errorf("ProviderRefID = %q, want OrderID", res.ProviderRefID)
	}
}

func TestManualBank_CreateCharge_NoBanks_StillWorks(t *testing.T) {
	// Config kosong — gateway tetap functional, instructions warn user.
	gw, err := buildManualBank(payments.PaymentMethod{
		Code:   payments.CodeManualBank,
		Label:  "Manual",
		Type:   payments.TypeManual,
		Config: json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("buildManualBank: %v", err)
	}
	res, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID: "INV-X",
		Amount:  100000,
	})
	if err != nil {
		t.Fatalf("CreateCharge: %v", err)
	}
	if !strings.Contains(res.Instructions, "belum di-set") {
		t.Errorf("expected warning about missing bank config: %s", res.Instructions)
	}
}

func TestManualBank_CreateCharge_ValidatesInput(t *testing.T) {
	gw, _ := buildManualBank(payments.PaymentMethod{Code: "manual_bank", Config: json.RawMessage(`{}`)})
	if _, err := gw.CreateCharge(context.Background(), ChargeRequest{OrderID: "X", Amount: 0}); err == nil {
		t.Error("expected error for amount=0")
	}
	if _, err := gw.CreateCharge(context.Background(), ChargeRequest{OrderID: "", Amount: 100}); err == nil {
		t.Error("expected error for empty order_id")
	}
}

func TestManualBank_HandleWebhook_ReturnsUnsupported(t *testing.T) {
	gw, _ := buildManualBank(payments.PaymentMethod{Code: "manual_bank", Config: json.RawMessage(`{}`)})
	_, err := gw.HandleWebhook(context.Background(), nil, []byte(`{}`))
	if !errors.Is(err, ErrUnsupported) {
		t.Errorf("expected ErrUnsupported, got %v", err)
	}
}
