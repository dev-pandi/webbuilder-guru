package hosts

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/provider"
)

func setupApp(fake *provider.FakeProvider) *fiber.App {
	app := fiber.New()
	h := NewHandler(fake)
	app.Get("/domains/:name/nameservers", h.Get)
	app.Post("/domains/:name/nameservers", h.Update)
	return app
}

func TestGetNameservers_Success(t *testing.T) {
	fake := provider.NewFake()
	app := setupApp(fake)

	req := httptest.NewRequest("GET", "/domains/example.id/nameservers", nil)
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "ns1.default.com") {
		t.Errorf("body missing ns: %s", body)
	}
}

func TestUpdateNameservers_ValidatesMinTwo(t *testing.T) {
	app := setupApp(provider.NewFake())

	body, _ := json.Marshal(map[string][]string{"nameservers": {"ns1.only.com"}})
	req := httptest.NewRequest("POST", "/domains/example.id/nameservers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 min 2, got %d", resp.StatusCode)
	}
}

func TestUpdateNameservers_ValidatesMaxThirteen(t *testing.T) {
	app := setupApp(provider.NewFake())

	ns := make([]string, 14)
	for i := range ns {
		ns[i] = "ns" + string(rune('a'+i)) + ".example.com"
	}
	body, _ := json.Marshal(map[string][]string{"nameservers": ns})
	req := httptest.NewRequest("POST", "/domains/example.id/nameservers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 max 13, got %d", resp.StatusCode)
	}
}

func TestUpdateNameservers_Success(t *testing.T) {
	fake := provider.NewFake()
	fake.UpdateNSFn = func(ctx context.Context, name string, ns []string) (*provider.NameserverInfo, error) {
		if len(ns) != 2 || name != "example.id" {
			t.Errorf("unexpected args: name=%s ns=%v", name, ns)
		}
		return &provider.NameserverInfo{Domain: name, Nameservers: ns}, nil
	}
	app := setupApp(fake)

	body, _ := json.Marshal(map[string][]string{"nameservers": {"ns1.foo.id", "ns2.foo.id"}})
	req := httptest.NewRequest("POST", "/domains/example.id/nameservers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if fake.CallCount("UpdateNameservers") != 1 {
		t.Errorf("provider not called")
	}
}
