package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestSecurityHeaders_AlwaysSet(t *testing.T) {
	app := fiber.New()
	app.Use(SecurityHeaders(false))
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil), -1)
	if err != nil {
		t.Fatalf("test: %v", err)
	}
	defer resp.Body.Close()

	for _, h := range []string{
		"X-Content-Type-Options", "X-Frame-Options",
		"Referrer-Policy", "Permissions-Policy",
	} {
		if resp.Header.Get(h) == "" {
			t.Errorf("missing header %s", h)
		}
	}
	if resp.Header.Get("Strict-Transport-Security") != "" {
		t.Errorf("HSTS should be absent outside production")
	}
}

func TestSecurityHeaders_HSTSOnlyInProd(t *testing.T) {
	app := fiber.New()
	app.Use(SecurityHeaders(true))
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil), -1)
	if err != nil {
		t.Fatalf("test: %v", err)
	}
	defer resp.Body.Close()

	if resp.Header.Get("Strict-Transport-Security") == "" {
		t.Errorf("HSTS should be set in production")
	}
}

func TestFirstIP(t *testing.T) {
	cases := map[string]string{
		"1.2.3.4":          "1.2.3.4",
		"1.2.3.4, 5.6.7.8": "1.2.3.4",
		"1.2.3.4,5.6.7.8":  "1.2.3.4",
		"":                 "",
	}
	for in, want := range cases {
		if got := firstIP(in); got != want {
			t.Errorf("firstIP(%q) = %q want %q", in, got, want)
		}
	}
}
