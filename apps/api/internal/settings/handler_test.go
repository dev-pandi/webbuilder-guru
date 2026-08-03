package settings

import (
	"bytes"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// Handler validation tests — cover input parsing branches yang return early
// (400 sebelum touch repo). Tidak butuh DB.

func newTestApp() *fiber.App {
	app := fiber.New()
	// Handler.repo tetap nil — validation branches return sebelum touch repo.
	h := &Handler{}
	app.Get("/settings/:key", h.Get)
	app.Patch("/settings/:key", h.Update)
	return app
}

func doReq(t *testing.T, app *fiber.App, method, path, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func TestUpdate_RejectsKeyWithoutNamespace(t *testing.T) {
	// Key "invalid" (no dot) → 400 sebelum touch repo.
	code, body := doReq(t, newTestApp(), "PATCH", "/settings/invalid", `{"value":"x"}`)
	if code != 400 || !strings.Contains(body, "format tidak valid") {
		t.Errorf("expected 400 with format hint, got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsInvalidJSON(t *testing.T) {
	code, body := doReq(t, newTestApp(), "PATCH", "/settings/tax.ppn_rate", `{malformed`)
	if code != 400 {
		t.Errorf("expected 400, got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsWhitespaceKey(t *testing.T) {
	// Space-only key → validation reject (either "wajib" atau "format tidak valid").
	// Both are correct — kedua branch return 400 sebelum touch repo.
	code, body := doReq(t, newTestApp(), "PATCH", "/settings/%20%20", `{"value":"x"}`)
	if code != 400 {
		t.Errorf("expected 400 for whitespace key, got %d body=%s", code, body)
	}
	if !strings.Contains(body, "key wajib") && !strings.Contains(body, "format tidak valid") {
		t.Errorf("expected validation error, got %s", body)
	}
}
