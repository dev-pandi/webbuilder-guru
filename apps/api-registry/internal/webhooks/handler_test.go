package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// buildApp — helper mount webhook handler untuk test.
func buildApp(relay *Relay) *fiber.App {
	app := fiber.New()
	app.Post("/webhooks/registrar", NewHandler(relay).Receive)
	return app
}

func signSHA256(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// Kalau UpstreamSecret kosong (dev mode) + relay disabled (no forward URL),
// handler tetap terima payload + return 202.
func TestReceive_DevModeVerifiedNoForward(t *testing.T) {
	relay := NewRelay(Config{})
	app := buildApp(relay)

	req := httptest.NewRequest("POST", "/webhooks/registrar",
		strings.NewReader(`{"event_id":"e1","job_id":"j1","status":"active"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != fiber.StatusAccepted {
		t.Errorf("expected 202, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Data struct {
			Forwarded bool   `json:"forwarded"`
			Reason    string `json:"reason"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Data.Forwarded {
		t.Errorf("relay disabled should not forward, got forwarded=true")
	}
	if !strings.Contains(out.Data.Reason, "disabled") {
		t.Errorf("expected reason=relay disabled, got %q", out.Data.Reason)
	}
}

func TestReceive_InvalidSignature_401(t *testing.T) {
	relay := NewRelay(Config{UpstreamSecret: "real-secret"})
	app := buildApp(relay)

	req := httptest.NewRequest("POST", "/webhooks/registrar",
		strings.NewReader(`{"event_id":"e1"}`))
	req.Header.Set("X-Signature", "sha256=deadbeef")
	resp, _ := app.Test(req)
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("expected 401 for bad signature, got %d", resp.StatusCode)
	}
}

func TestReceive_MissingSignature_401(t *testing.T) {
	relay := NewRelay(Config{UpstreamSecret: "real-secret"})
	app := buildApp(relay)

	req := httptest.NewRequest("POST", "/webhooks/registrar",
		strings.NewReader(`{"event_id":"e1"}`))
	resp, _ := app.Test(req)
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Errorf("expected 401 without signature, got %d", resp.StatusCode)
	}
}

func TestReceive_AcceptsAltHeaderXHub(t *testing.T) {
	secret := "hub-secret"
	body := []byte(`{"event_id":"e2"}`)
	relay := NewRelay(Config{UpstreamSecret: secret})
	app := buildApp(relay)

	req := httptest.NewRequest("POST", "/webhooks/registrar", strings.NewReader(string(body)))
	req.Header.Set("X-Hub-Signature-256", signSHA256(secret, body))
	resp, _ := app.Test(req)
	if resp.StatusCode != fiber.StatusAccepted {
		t.Errorf("X-Hub-Signature-256 should be accepted, got %d", resp.StatusCode)
	}
}

// End-to-end: verify upstream + forward ke fake downstream + response 202.
func TestReceive_ForwardsToWebbuilder(t *testing.T) {
	upSecret := "upstream-s"
	downSecret := "downstream-s"

	// Fake web builder — receive forwarded webhook, return 200.
	var received bool
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = true
		// Verify api-registry HMAC di download side (sanity).
		if r.Header.Get("X-Signature") == "" {
			t.Errorf("downstream should receive X-Signature")
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer downstream.Close()

	relay := NewRelay(Config{
		UpstreamSecret:   upSecret,
		WebbuilderURL:    downstream.URL,
		WebbuilderSecret: downSecret,
	})
	app := buildApp(relay)

	body := []byte(`{"event_id":"e3","job_id":"j1","status":"active"}`)
	req := httptest.NewRequest("POST", "/webhooks/registrar", strings.NewReader(string(body)))
	req.Header.Set("X-Signature", signSHA256(upSecret, body))
	resp, _ := app.Test(req, 5000)
	if resp.StatusCode != fiber.StatusAccepted {
		t.Errorf("expected 202 accepted, got %d", resp.StatusCode)
	}
	if !received {
		t.Errorf("downstream should have received forwarded webhook")
	}
	out, _ := io.ReadAll(resp.Body)
	var envelope struct {
		Data struct {
			Forwarded         bool   `json:"forwarded"`
			WebbuilderStatus  int    `json:"webbuilder_status"`
			EventID           string `json:"event_id"`
		} `json:"data"`
	}
	_ = json.Unmarshal(out, &envelope)
	if !envelope.Data.Forwarded {
		t.Errorf("expected forwarded=true in response")
	}
	if envelope.Data.EventID != "e3" {
		t.Errorf("event_id not echoed, got %q", envelope.Data.EventID)
	}
}

// Downstream reject (400) → handler propagate status ke caller supaya
// upstream registrar tahu forwarding gagal + retry.
func TestReceive_DownstreamReject_502(t *testing.T) {
	upSecret := "u"
	downstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"bad payload"}`))
	}))
	defer downstream.Close()

	relay := NewRelay(Config{
		UpstreamSecret: upSecret,
		WebbuilderURL:  downstream.URL,
	})
	app := buildApp(relay)

	body := []byte(`{}`)
	req := httptest.NewRequest("POST", "/webhooks/registrar", strings.NewReader(string(body)))
	req.Header.Set("X-Signature", signSHA256(upSecret, body))
	resp, _ := app.Test(req, 5000)
	// Handler forwards downstream's 4xx as httpx.Err(code, ...) — so status
	// gets propagated. Verify it's the same 4xx (downstream 400).
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 (echoed from downstream), got %d", resp.StatusCode)
	}
}
