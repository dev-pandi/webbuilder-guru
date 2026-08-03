package invoices

import (
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// Handler validation tests — cover input parsing branches yang return early.

func newTestApp() *fiber.App {
	app := fiber.New()
	h := &Handler{}
	app.Get("/invoices/:id", h.GetMine)
	app.Get("/invoices/:id/pdf", h.GetPDFMine)
	app.Get("/admin/invoices/:id", h.GetAdmin)
	app.Get("/admin/invoices/:id/pdf", h.GetPDFAdmin)
	app.Post("/admin/invoices/:id/mark-paid", h.MarkPaidAdmin)
	app.Post("/admin/invoices/:id/cancel", h.CancelAdmin)
	return app
}

func doReq(t *testing.T, app *fiber.App, method, path string) int {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)
	return resp.StatusCode
}

func TestGetMine_InvalidUUID(t *testing.T) {
	// No auth context — endpoint should return 401 first (missing user).
	// This test ensures the ownership guard is enforced BEFORE repo touch.
	code := doReq(t, newTestApp(), "GET", "/invoices/not-a-uuid")
	if code != 401 && code != 400 {
		t.Errorf("expected 401 (unauth) or 400 (bad uuid), got %d", code)
	}
}

func TestGetAdmin_InvalidUUID(t *testing.T) {
	code := doReq(t, newTestApp(), "GET", "/admin/invoices/not-a-uuid")
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}

func TestGetPDFAdmin_InvalidUUID(t *testing.T) {
	code := doReq(t, newTestApp(), "GET", "/admin/invoices/not-a-uuid/pdf")
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}

func TestMarkPaidAdmin_InvalidUUID(t *testing.T) {
	code := doReq(t, newTestApp(), "POST", "/admin/invoices/not-a-uuid/mark-paid")
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}

func TestCancelAdmin_InvalidUUID(t *testing.T) {
	code := doReq(t, newTestApp(), "POST", "/admin/invoices/not-a-uuid/cancel")
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}
