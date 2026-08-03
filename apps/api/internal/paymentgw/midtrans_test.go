package paymentgw

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/webbuilder/api/internal/payments"
)

// Signature computation harus deterministic + match spec Midtrans:
// sha512(order_id + status_code + gross_amount + server_key)
func TestComputeMidtransSig_Deterministic(t *testing.T) {
	sig1 := computeMidtransSig("ORDER-1", "200", "12345.00", "SB-Mid-server-xxx")
	sig2 := computeMidtransSig("ORDER-1", "200", "12345.00", "SB-Mid-server-xxx")
	if sig1 != sig2 {
		t.Errorf("signature not deterministic")
	}
	if len(sig1) != 128 { // sha512 = 64 bytes = 128 hex chars
		t.Errorf("signature length = %d, expected 128", len(sig1))
	}
}

func TestComputeMidtransSig_DiffersForDifferentInputs(t *testing.T) {
	base := computeMidtransSig("A", "200", "100.00", "key")
	if computeMidtransSig("B", "200", "100.00", "key") == base {
		t.Error("different order_id should produce different sig")
	}
	if computeMidtransSig("A", "201", "100.00", "key") == base {
		t.Error("different status_code should produce different sig")
	}
	if computeMidtransSig("A", "200", "999.00", "key") == base {
		t.Error("different amount should produce different sig")
	}
	if computeMidtransSig("A", "200", "100.00", "other") == base {
		t.Error("different server_key should produce different sig")
	}
}

func TestMapMidtransStatus(t *testing.T) {
	cases := []struct {
		txn, fraud string
		want       Status
	}{
		{"settlement", "", StatusSuccess},
		{"capture", "accept", StatusSuccess},
		{"capture", "challenge", StatusPending},
		{"pending", "", StatusPending},
		{"authorize", "", StatusPending},
		{"deny", "", StatusFailed},
		{"cancel", "", StatusFailed},
		{"expire", "", StatusExpired},
		{"refund", "", StatusRefund},
		{"partial_refund", "", StatusRefund},
		{"chargeback", "", StatusRefund},
		{"unknown", "", StatusPending}, // default → pending (safe)
	}
	for _, tc := range cases {
		got := mapMidtransStatus(tc.txn, tc.fraud)
		if got != tc.want {
			t.Errorf("mapMidtransStatus(%q, %q) = %v, want %v", tc.txn, tc.fraud, got, tc.want)
		}
	}
}

func TestParseGrossAmount(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"12345.00", 12345},
		{"100", 100},
		{"0.00", 0},
		{"999999999.00", 999999999},
		{"invalid", 0},
		{"", 0},
	}
	for _, tc := range cases {
		if got := parseGrossAmount(tc.in); got != tc.want {
			t.Errorf("parseGrossAmount(%q) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestTruncate(t *testing.T) {
	if truncate("hello", 10) != "hello" {
		t.Error("truncate should preserve short strings")
	}
	if truncate("hello world", 5) != "hello" {
		t.Error("truncate should cut at n")
	}
}

// Integration test: fake Midtrans Snap server + verify request shape.
func TestMidtrans_CreateCharge_HitsSnapAPI(t *testing.T) {
	var receivedBody []byte
	var receivedAuth string

	// Fake Midtrans Snap endpoint.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		receivedBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"snap-token-123","redirect_url":"https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-123"}`))
	}))
	defer srv.Close()

	// Build gateway pointing to fake server.
	cfg, _ := json.Marshal(midtransConfig{
		ServerKey:    "SB-Mid-server-secret",
		ClientKey:    "SB-Mid-client-public",
		IsProduction: false,
		SnapURL:      srv.URL,
	})
	gw, err := buildMidtrans(payments.PaymentMethod{
		Code:  payments.CodeMidtrans,
		Label: "Midtrans",
		Type:  payments.TypeGateway,
		Config: cfg,
	})
	if err != nil {
		t.Fatalf("buildMidtrans: %v", err)
	}

	// Call CreateCharge.
	res, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID:     "INV-2026-000123",
		Amount:      250000,
		Currency:    "IDR",
		Description: "Domain myshop.id 1 tahun",
		Customer:    Customer{Name: "Budi", Email: "budi@example.com", Phone: "+62812345"},
		ReturnURL:   "https://web.example.com/checkout/return",
		ExpiresAt:   time.Now().Add(30 * time.Minute),
	})
	if err != nil {
		t.Fatalf("CreateCharge: %v", err)
	}

	// Verify response.
	if res.ProviderRefID != "snap-token-123" {
		t.Errorf("ProviderRefID = %q", res.ProviderRefID)
	}
	if !strings.Contains(res.PaymentURL, "snap-token-123") {
		t.Errorf("PaymentURL = %q", res.PaymentURL)
	}

	// Verify HTTP request shape.
	expectedAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("SB-Mid-server-secret:"))
	if receivedAuth != expectedAuth {
		t.Errorf("Authorization = %q, want %q", receivedAuth, expectedAuth)
	}
	var body snapReq
	if err := json.Unmarshal(receivedBody, &body); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if body.TransactionDetails.OrderID != "INV-2026-000123" {
		t.Errorf("order_id mismatch: %q", body.TransactionDetails.OrderID)
	}
	if body.TransactionDetails.GrossAmount != 250000 {
		t.Errorf("gross_amount mismatch: %d", body.TransactionDetails.GrossAmount)
	}
	if body.Callbacks == nil || body.Callbacks.Finish != "https://web.example.com/checkout/return" {
		t.Errorf("callbacks.finish mismatch: %+v", body.Callbacks)
	}
	if body.Expiry == nil || body.Expiry.Duration <= 0 || body.Expiry.Unit != "minute" {
		t.Errorf("expiry mismatch: %+v", body.Expiry)
	}
}

func TestMidtrans_CreateCharge_RejectsBadResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"status_code":"402","error_messages":["invalid amount"]}`))
	}))
	defer srv.Close()

	cfg, _ := json.Marshal(midtransConfig{
		ServerKey: "x",
		SnapURL:   srv.URL,
	})
	gw, _ := buildMidtrans(payments.PaymentMethod{Code: "midtrans", Config: cfg})
	_, err := gw.CreateCharge(context.Background(), ChargeRequest{OrderID: "X", Amount: 100})
	if err == nil {
		t.Fatal("expected error for 400 response")
	}
	if !strings.Contains(err.Error(), "invalid amount") {
		t.Errorf("error should include upstream message: %v", err)
	}
}

func TestMidtrans_HandleWebhook_ValidSignature(t *testing.T) {
	serverKey := "SB-Mid-server-secret"
	orderID := "INV-2026-000123"
	statusCode := "200"
	grossAmount := "250000.00"
	txnID := "3d5f5678-1234-abcd-ef01-1234567890ab"

	sig := computeMidtransSig(orderID, statusCode, grossAmount, serverKey)
	payload := map[string]string{
		"order_id":           orderID,
		"transaction_status": "settlement",
		"fraud_status":       "accept",
		"status_code":        statusCode,
		"gross_amount":       grossAmount,
		"transaction_id":     txnID,
		"transaction_time":   "2026-01-15 14:30:00",
		"signature_key":      sig,
	}
	body, _ := json.Marshal(payload)

	cfg, _ := json.Marshal(midtransConfig{ServerKey: serverKey, SnapURL: "http://unused"})
	gw, _ := buildMidtrans(payments.PaymentMethod{Code: "midtrans", Config: cfg})
	ev, err := gw.HandleWebhook(context.Background(), nil, body)
	if err != nil {
		t.Fatalf("HandleWebhook: %v", err)
	}
	if ev.Status != StatusSuccess {
		t.Errorf("Status = %v, want %v", ev.Status, StatusSuccess)
	}
	if ev.OrderID != orderID {
		t.Errorf("OrderID = %q", ev.OrderID)
	}
	if ev.ProviderRefID != txnID {
		t.Errorf("ProviderRefID = %q", ev.ProviderRefID)
	}
	if ev.Amount != 250000 {
		t.Errorf("Amount = %d", ev.Amount)
	}
	if ev.PaidAt.IsZero() {
		t.Error("PaidAt should be parsed from transaction_time")
	}
}

func TestMidtrans_HandleWebhook_RejectsInvalidSignature(t *testing.T) {
	cfg, _ := json.Marshal(midtransConfig{ServerKey: "real-key", SnapURL: "http://unused"})
	gw, _ := buildMidtrans(payments.PaymentMethod{Code: "midtrans", Config: cfg})

	payload := map[string]string{
		"order_id":      "X",
		"status_code":   "200",
		"gross_amount":  "100.00",
		"signature_key": "fake-signature-does-not-match",
	}
	body, _ := json.Marshal(payload)

	_, err := gw.HandleWebhook(context.Background(), nil, body)
	if err == nil {
		t.Fatal("expected signature error, got nil")
	}
	if !bytes.Contains([]byte(err.Error()), []byte("signature")) {
		t.Errorf("expected signature error, got %v", err)
	}
}
