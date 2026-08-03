package zones

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
//
// Untuk validation yang butuh cross-field check (min_years vs max_years),
// juga di sini karena murni logic tanpa DB.

func newTestApp() *fiber.App {
	app := fiber.New()
	// Handler.repo tetap nil di sini — request yang lolos validasi akan
	// panic saat call repo. Test hanya exercise validation branches yang
	// return BEFORE repo access.
	h := &Handler{repo: nil}
	app.Post("/zones", h.Create)
	app.Patch("/zones/:id", h.Update)
	app.Delete("/zones/:id", h.Delete)
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

func TestCreate_RejectsInvalidJSON(t *testing.T) {
	code, body := doReq(t, newTestApp(), "POST", "/zones", `{invalid`)
	if code != 400 {
		t.Errorf("expected 400, got %d body=%s", code, body)
	}
}

func TestCreate_RejectsEmptyTLD(t *testing.T) {
	code, body := doReq(t, newTestApp(), "POST", "/zones", `{"tld":""}`)
	if code != 400 || !strings.Contains(body, "tld wajib") {
		t.Errorf("expected 400 with 'tld wajib', got %d body=%s", code, body)
	}
}

func TestCreate_RejectsLeadingDotInTLD(t *testing.T) {
	code, body := doReq(t, newTestApp(), "POST", "/zones", `{"tld":".id","label":".id"}`)
	if code != 400 || !strings.Contains(body, "tanpa titik") {
		t.Errorf("expected 400 with hint about leading dot, got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsInvalidUUID(t *testing.T) {
	code, body := doReq(t, newTestApp(), "PATCH", "/zones/not-a-uuid", `{}`)
	if code != 400 || !strings.Contains(body, "id tidak valid") {
		t.Errorf("expected 400 with 'id tidak valid', got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsMinYearsLessThan1(t *testing.T) {
	// Valid UUID supaya path parse lolos.
	code, body := doReq(t, newTestApp(), "PATCH", "/zones/00000000-0000-0000-0000-000000000001",
		`{"min_years":0}`)
	if code != 400 || !strings.Contains(body, "min_years minimal 1") {
		t.Errorf("expected 400 with min_years hint, got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsMaxYearsLessThanMin(t *testing.T) {
	code, body := doReq(t, newTestApp(), "PATCH", "/zones/00000000-0000-0000-0000-000000000001",
		`{"min_years":5,"max_years":2}`)
	if code != 400 || !strings.Contains(body, "max_years") {
		t.Errorf("expected 400 with max_years hint, got %d body=%s", code, body)
	}
}

func TestDelete_RejectsInvalidUUID(t *testing.T) {
	code, _ := doReq(t, newTestApp(), "DELETE", "/zones/not-a-uuid", "")
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}
