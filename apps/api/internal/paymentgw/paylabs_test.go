package paymentgw

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/webbuilder/api/internal/payments"
)

func TestComputePaylabsSig_Deterministic(t *testing.T) {
	body := []byte(`{"orderId":"INV-1","amount":100000}`)
	ts := "2026-08-03T12:00:00Z"
	key := "sk_live_secret"
	sig1 := computePaylabsSig(body, ts, key)
	sig2 := computePaylabsSig(body, ts, key)
	if sig1 != sig2 {
		t.Errorf("signature not deterministic")
	}
	if len(sig1) != 64 { // sha256 = 32 bytes = 64 hex chars
		t.Errorf("sig length = %d, want 64", len(sig1))
	}
}

func TestComputePaylabsSig_DiffersForDifferentInputs(t *testing.T) {
	base := computePaylabsSig([]byte(`{"a":1}`), "2026-01-01T00:00:00Z", "key")
	if computePaylabsSig([]byte(`{"a":2}`), "2026-01-01T00:00:00Z", "key") == base {
		t.Error("different body → different sig")
	}
	if computePaylabsSig([]byte(`{"a":1}`), "2026-01-02T00:00:00Z", "key") == base {
		t.Error("different timestamp → different sig")
	}
	if computePaylabsSig([]byte(`{"a":1}`), "2026-01-01T00:00:00Z", "other") == base {
		t.Error("different api_key → different sig")
	}
}

func TestMapPaylabsStatus(t *testing.T) {
	cases := []struct {
		in   string
		want Status
	}{
		{"SUCCESS", StatusSuccess},
		{"PAID", StatusSuccess},
		{"COMPLETED", StatusSuccess},
		{"success", StatusSuccess}, // case-insensitive
		{"PENDING", StatusPending},
		{"PROCESSING", StatusPending},
		{"FAILED", StatusFailed},
		{"REJECTED", StatusFailed},
		{"CANCELLED", StatusFailed},
		{"EXPIRED", StatusExpired},
		{"TIMEOUT", StatusExpired},
		{"REFUND", StatusRefund},
		{"REFUNDED", StatusRefund},
		{"UNKNOWN_STATUS", StatusPending}, // default → pending
	}
	for _, tc := range cases {
		if got := mapPaylabsStatus(tc.in); got != tc.want {
			t.Errorf("mapPaylabsStatus(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestBuildPaylabs_ValidatesConfig(t *testing.T) {
	// Missing merchant_id → error.
	cfg, _ := json.Marshal(paylabsConfig{APIKey: "x"})
	if _, err := buildPaylabs(payments.PaymentMethod{
		Code: payments.CodePaylabs, Config: cfg,
	}); err == nil {
		t.Error("expected error kalau merchant_id kosong")
	}
	// Missing api_key → error.
	cfg2, _ := json.Marshal(paylabsConfig{MerchantID: "MC-x"})
	if _, err := buildPaylabs(payments.PaymentMethod{
		Code: payments.CodePaylabs, Config: cfg2,
	}); err == nil {
		t.Error("expected error kalau api_key kosong")
	}
}

func TestBuildPaylabs_DefaultsAppliedWhenMissing(t *testing.T) {
	cfg, _ := json.Marshal(paylabsConfig{
		MerchantID: "MC-abc",
		APIKey:     "sk_live",
	})
	gw, err := buildPaylabs(payments.PaymentMethod{
		Code: payments.CodePaylabs, Label: "Paylabs", Config: cfg,
	})
	if err != nil {
		t.Fatalf("buildPaylabs: %v", err)
	}
	pgw := gw.(*PaylabsGateway)
	if pgw.config.Endpoint != "https://api.paylabs.co.id" {
		t.Errorf("endpoint default = %q", pgw.config.Endpoint)
	}
	if pgw.config.Channel != "snap" {
		t.Errorf("channel default = %q", pgw.config.Channel)
	}
	if pgw.Type() != payments.TypeGateway {
		t.Errorf("type = %q", pgw.Type())
	}
}

// Integration test: mock Paylabs endpoint + verify request shape.
func TestPaylabs_CreateCharge_HitsAPI(t *testing.T) {
	var receivedBody []byte
	var receivedSig, receivedTs, receivedPartner string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedBody, _ = io.ReadAll(r.Body)
		receivedSig = r.Header.Get("X-SIGNATURE")
		receivedTs = r.Header.Get("X-TIMESTAMP")
		receivedPartner = r.Header.Get("X-PARTNER-ID")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"success": true,
			"paymentId": "PAY-xyz-123",
			"paymentUrl": "https://checkout.paylabs.co.id/pay/xyz",
			"expireTime": "2026-08-03T13:00:00Z"
		}`))
	}))
	defer srv.Close()

	cfg, _ := json.Marshal(paylabsConfig{
		MerchantID: "MC-abc",
		APIKey:     "sk_live_secret",
		Endpoint:   srv.URL,
		Channel:    "snap",
	})
	gw, _ := buildPaylabs(payments.PaymentMethod{
		Code: payments.CodePaylabs, Label: "Paylabs", Config: cfg,
	})

	res, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID:     "INV-2026-000123",
		Amount:      250000,
		Currency:    "IDR",
		Description: "Domain myshop.id",
		Customer:    Customer{Name: "Budi", Email: "budi@example.com", Phone: "+62812"},
		ReturnURL:   "https://web.example.com/checkout/return",
		ExpiresAt:   time.Now().Add(30 * time.Minute),
	})
	if err != nil {
		t.Fatalf("CreateCharge: %v", err)
	}
	if res.ProviderRefID != "PAY-xyz-123" {
		t.Errorf("ProviderRefID = %q", res.ProviderRefID)
	}
	if res.PaymentURL != "https://checkout.paylabs.co.id/pay/xyz" {
		t.Errorf("PaymentURL = %q", res.PaymentURL)
	}

	// Verify headers.
	if receivedPartner != "MC-abc" {
		t.Errorf("X-PARTNER-ID = %q", receivedPartner)
	}
	if receivedSig == "" || receivedTs == "" {
		t.Errorf("signature/timestamp headers missing: sig=%q ts=%q", receivedSig, receivedTs)
	}
	// Verify signature reproducible.
	expectedSig := computePaylabsSig(receivedBody, receivedTs, "sk_live_secret")
	if receivedSig != expectedSig {
		t.Errorf("signature mismatch: got %s, want %s", receivedSig, expectedSig)
	}

	// Verify body shape.
	var body paylabsCreateReq
	if err := json.Unmarshal(receivedBody, &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.MerchantID != "MC-abc" || body.OrderID != "INV-2026-000123" || body.Amount != 250000 {
		t.Errorf("body mismatch: %+v", body)
	}
	if body.Channel != "snap" {
		t.Errorf("channel not passed: %q", body.Channel)
	}
}

func TestPaylabs_CreateCharge_ErrorResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"success":false,"errorCode":"AMT001","errorMessage":"amount too small"}`))
	}))
	defer srv.Close()

	cfg, _ := json.Marshal(paylabsConfig{
		MerchantID: "MC-x", APIKey: "sk", Endpoint: srv.URL,
	})
	gw, _ := buildPaylabs(payments.PaymentMethod{Code: payments.CodePaylabs, Config: cfg})
	_, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID: "X", Amount: 100,
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "amount too small") {
		t.Errorf("error should include upstream message: %v", err)
	}
}

func TestPaylabs_HandleWebhook_ValidSignature(t *testing.T) {
	apiKey := "sk_live_secret"
	body := []byte(`{
		"merchantId": "MC-abc",
		"paymentId": "PAY-xyz-123",
		"orderId": "INV-2026-000123",
		"amount": 250000,
		"currency": "IDR",
		"status": "SUCCESS",
		"paymentTime": "2026-08-03T12:30:00Z"
	}`)
	ts := "2026-08-03T12:30:05Z"
	sig := computePaylabsSig(body, ts, apiKey)

	cfg, _ := json.Marshal(paylabsConfig{
		MerchantID: "MC-abc",
		APIKey:     apiKey,
		Endpoint:   "http://unused",
	})
	gw, _ := buildPaylabs(payments.PaymentMethod{Code: payments.CodePaylabs, Config: cfg})

	headers := map[string]string{
		"X-SIGNATURE": sig,
		"X-TIMESTAMP": ts,
	}
	ev, err := gw.HandleWebhook(context.Background(), headers, body)
	if err != nil {
		t.Fatalf("HandleWebhook: %v", err)
	}
	if ev.Status != StatusSuccess {
		t.Errorf("Status = %v", ev.Status)
	}
	if ev.OrderID != "INV-2026-000123" || ev.ProviderRefID != "PAY-xyz-123" {
		t.Errorf("shape mismatch: %+v", ev)
	}
	if ev.Amount != 250000 {
		t.Errorf("amount = %d", ev.Amount)
	}
	if ev.PaidAt.IsZero() {
		t.Error("PaidAt should be parsed")
	}
}

func TestPaylabs_HandleWebhook_RejectsInvalidSignature(t *testing.T) {
	cfg, _ := json.Marshal(paylabsConfig{
		MerchantID: "MC-x", APIKey: "real-key", Endpoint: "http://unused",
	})
	gw, _ := buildPaylabs(payments.PaymentMethod{Code: payments.CodePaylabs, Config: cfg})

	headers := map[string]string{
		"X-SIGNATURE": "0000000000000000000000000000000000000000000000000000000000000000",
		"X-TIMESTAMP": "2026-08-03T12:00:00Z",
	}
	_, err := gw.HandleWebhook(context.Background(), headers, []byte(`{"orderId":"X"}`))
	if err == nil {
		t.Fatal("expected signature error")
	}
	if err != ErrInvalidSignature {
		t.Errorf("expected ErrInvalidSignature, got %v", err)
	}
}

func TestPaylabs_HandleWebhook_RejectsMissingSignature(t *testing.T) {
	cfg, _ := json.Marshal(paylabsConfig{
		MerchantID: "MC-x", APIKey: "k", Endpoint: "http://unused",
	})
	gw, _ := buildPaylabs(payments.PaymentMethod{Code: payments.CodePaylabs, Config: cfg})

	// Missing headers.
	_, err := gw.HandleWebhook(context.Background(), map[string]string{}, []byte(`{}`))
	if err != ErrInvalidSignature {
		t.Errorf("expected ErrInvalidSignature for missing headers, got %v", err)
	}
	// Only sig, no ts.
	_, err = gw.HandleWebhook(context.Background(),
		map[string]string{"X-SIGNATURE": "abc"}, []byte(`{}`))
	if err != ErrInvalidSignature {
		t.Errorf("expected ErrInvalidSignature for missing ts, got %v", err)
	}
}
