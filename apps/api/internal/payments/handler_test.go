package payments

import (
	"bytes"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// Handler validation tests — cover input parsing branches yang return early
// (400 sebelum touch repo).

func newTestApp() *fiber.App {
	app := fiber.New()
	h := &Handler{}
	app.Post("/payment-methods", h.Create)
	app.Patch("/payment-methods/:id", h.Update)
	app.Delete("/payment-methods/:id", h.Delete)
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
	code, _ := doReq(t, newTestApp(), "POST", "/payment-methods", `{malformed`)
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}

func TestCreate_RejectsEmptyCode(t *testing.T) {
	code, body := doReq(t, newTestApp(), "POST", "/payment-methods",
		`{"code":"","label":"X","type":"gateway"}`)
	if code != 400 || !strings.Contains(body, "code dan label wajib") {
		t.Errorf("expected 400 with code+label hint, got %d body=%s", code, body)
	}
}

func TestCreate_RejectsEmptyLabel(t *testing.T) {
	code, body := doReq(t, newTestApp(), "POST", "/payment-methods",
		`{"code":"custom","label":"","type":"gateway"}`)
	if code != 400 || !strings.Contains(body, "code dan label wajib") {
		t.Errorf("expected 400, got %d body=%s", code, body)
	}
}

func TestCreate_RejectsInvalidType(t *testing.T) {
	code, body := doReq(t, newTestApp(), "POST", "/payment-methods",
		`{"code":"custom","label":"Custom","type":"crypto"}`)
	if code != 400 || !strings.Contains(body, "type harus") {
		t.Errorf("expected 400 with type hint, got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsInvalidUUID(t *testing.T) {
	code, body := doReq(t, newTestApp(), "PATCH", "/payment-methods/not-a-uuid",
		`{"enabled":true}`)
	if code != 400 || !strings.Contains(body, "id tidak valid") {
		t.Errorf("expected 400 with id hint, got %d body=%s", code, body)
	}
}

func TestUpdate_RejectsInvalidJSON(t *testing.T) {
	code, _ := doReq(t, newTestApp(), "PATCH",
		"/payment-methods/00000000-0000-0000-0000-000000000001", `{malformed`)
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}

func TestDelete_RejectsInvalidUUID(t *testing.T) {
	code, _ := doReq(t, newTestApp(), "DELETE", "/payment-methods/not-a-uuid", "")
	if code != 400 {
		t.Errorf("expected 400, got %d", code)
	}
}
