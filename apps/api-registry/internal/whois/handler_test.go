package whois

import (
	"context"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/provider"
)

func TestWhois_MissingQuery(t *testing.T) {
	app := fiber.New()
	app.Get("/whois", NewHandler(provider.NewFake()).Whois)

	resp, _ := app.Test(httptest.NewRequest("GET", "/whois", nil))
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 missing domain, got %d", resp.StatusCode)
	}
}

func TestWhois_Success(t *testing.T) {
	fake := provider.NewFake()
	fake.WhoisFn = func(ctx context.Context, domain string) (*provider.Whois, error) {
		return &provider.Whois{Domain: domain, Status: "registered", Registrar: "PANDI"}, nil
	}
	app := fiber.New()
	app.Get("/whois", NewHandler(fake).Whois)

	resp, _ := app.Test(httptest.NewRequest("GET", "/whois?domain=example.id", nil))
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "PANDI") {
		t.Errorf("body missing registrar: %s", body)
	}
}

func TestWhois_NotFoundMapped(t *testing.T) {
	fake := provider.NewFake()
	fake.WhoisFn = func(ctx context.Context, domain string) (*provider.Whois, error) {
		return nil, provider.ErrNotFound
	}
	app := fiber.New()
	app.Get("/whois", NewHandler(fake).Whois)

	resp, _ := app.Test(httptest.NewRequest("GET", "/whois?domain=missing.id", nil))
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}
