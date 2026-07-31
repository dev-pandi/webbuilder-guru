package security

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

func TestHMACMiddleware_HappyPath(t *testing.T) {
	secret := "test-secret"
	app := fiber.New()
	app.Use(HMACMiddleware(secret))
	app.Post("/protected", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	body := []byte(`{"foo":"bar"}`)
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	// Signature scope: ts + "." + method + originalURL + "." + body
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte{'.'})
	mac.Write([]byte("POST"))
	mac.Write([]byte("/protected"))
	mac.Write([]byte{'.'})
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest("POST", "/protected", bytes.NewReader(body))
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", "sha256="+sig)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
}

func TestHMACMiddleware_MissingHeaders(t *testing.T) {
	app := fiber.New()
	app.Use(HMACMiddleware("secret"))
	app.Post("/protected", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest("POST", "/protected", nil)
	resp, _ := app.Test(req)
	if resp.StatusCode != 401 {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestHMACMiddleware_ExpiredTimestamp(t *testing.T) {
	secret := "secret"
	app := fiber.New()
	app.Use(HMACMiddleware(secret))
	app.Post("/protected", func(c *fiber.Ctx) error { return c.SendString("ok") })

	body := []byte(`{}`)
	ts := strconv.FormatInt(time.Now().Add(-10*time.Minute).Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte{'.'})
	mac.Write([]byte("POST"))
	mac.Write([]byte("/protected"))
	mac.Write([]byte{'.'})
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest("POST", "/protected", bytes.NewReader(body))
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", "sha256="+sig)
	resp, _ := app.Test(req)
	if resp.StatusCode != 401 {
		t.Errorf("expected 401 stale ts, got %d", resp.StatusCode)
	}
}

func TestHMACMiddleware_TamperedBody(t *testing.T) {
	secret := "secret"
	app := fiber.New()
	app.Use(HMACMiddleware(secret))
	app.Post("/protected", func(c *fiber.Ctx) error { return c.SendString("ok") })

	signedBody := []byte(`{"amount":100}`)
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte{'.'})
	mac.Write([]byte("POST"))
	mac.Write([]byte("/protected"))
	mac.Write([]byte{'.'})
	mac.Write(signedBody)
	sig := hex.EncodeToString(mac.Sum(nil))

	// Signed body 100, actual sent 999 (attacker mengubah amount).
	tamperedBody := []byte(`{"amount":999}`)
	req := httptest.NewRequest("POST", "/protected", bytes.NewReader(tamperedBody))
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", "sha256="+sig)
	resp, _ := app.Test(req)
	if resp.StatusCode != 401 {
		t.Errorf("expected 401 tampered body, got %d", resp.StatusCode)
	}
}

func TestHMACMiddleware_SkipsHealthz(t *testing.T) {
	app := fiber.New()
	app.Use(HMACMiddleware("secret"))
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest("GET", "/healthz", nil)
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Errorf("healthz should skip auth, got %d", resp.StatusCode)
	}
}

func TestHMACMiddleware_EmptySecretIsNoop(t *testing.T) {
	app := fiber.New()
	app.Use(HMACMiddleware(""))
	app.Post("/protected", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest("POST", "/protected", nil)
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Errorf("empty secret should allow all, got %d", resp.StatusCode)
	}
}
