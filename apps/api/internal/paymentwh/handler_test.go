package paymentwh

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// Handler nil-dep smoke tests.
// Full flow (registry+gateway+invoices) di-cover via consumer integration
// test — tidak di sini karena butuh DB.

func TestNewHandler_ConstructsWithNilDeps(t *testing.T) {
	h := NewHandler(nil, nil, nil)
	if h == nil {
		t.Fatal("NewHandler returned nil")
	}
	if h.registry != nil || h.invoicesSvc != nil || h.invoicesRepo != nil {
		t.Error("nil deps should stay nil")
	}
	if h.onPaid != nil {
		t.Error("onPaid should default nil")
	}
}

func TestSetPaidCallback_IdempotentNilSet(t *testing.T) {
	h := NewHandler(nil, nil, nil)
	h.SetPaidCallback(nil) // should not panic
	if h.onPaid != nil {
		t.Error("SetPaidCallback(nil) → onPaid stay nil")
	}
}

// TestReceive_MethodNotAllowedOnGET — Fiber routing sanity: hanya POST yang
// registered ke /webhooks/payment/:code. GET → 405 (Fiber default) atau 404.
func TestReceive_MethodNotAllowedOnGET(t *testing.T) {
	app := fiber.New()
	h := NewHandler(nil, nil, nil)
	app.Post("/webhooks/payment/:code", h.Receive)

	req := httptest.NewRequest("GET", "/webhooks/payment/midtrans", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 405 && resp.StatusCode != 404 {
		t.Errorf("expected 405 or 404 for GET, got %d", resp.StatusCode)
	}
}
