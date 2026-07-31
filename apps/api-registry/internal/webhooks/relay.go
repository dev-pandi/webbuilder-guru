// Package webhooks — relay pattern: terima webhook dari upstream registrar
// (registrar-api PANDI atau EPP-provider), verify signature-nya, lalu
// forward ke consumer (web builder) dengan signing HMAC api-registry sendiri.
//
// Kenapa relay bukan direct?
//
// Web builder cuma boleh trust api-registry (1 origin, 1 secret). Kalau
// registrar-api langsung nge-webhook web builder, web builder harus tau
// tentang PANDI credentials — bocor abstraksi. Dengan relay:
//
//   registrar-api → api-registry (registrar's HMAC) → web builder (api-registry's HMAC)
//
// Web builder cuma verify signature dari api-registry — provider bisa
// swap tanpa web builder tau.
//
// Bonus: relay bisa transform payload (mis. rename field lama ke shape
// baru), audit event, dedup by event_id.
package webhooks

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Config — dep injection dari main.go. Nol nilai = webhook disabled (nil
// forwarder log warn kalau POST datang).
type Config struct {
	// Verify inbound webhook dari registrar-api.
	UpstreamSecret string // PANDI's registrar HMAC secret

	// Forward ke web builder.
	WebbuilderURL    string // "http://web-builder-api:8080/internal/webhooks/registry"
	WebbuilderSecret string // shared secret dengan web builder
	Timeout          time.Duration
}

// Relay — receiver + forwarder handler bundle.
type Relay struct {
	cfg  Config
	http *http.Client
}

func NewRelay(cfg Config) *Relay {
	if cfg.Timeout == 0 {
		cfg.Timeout = 10 * time.Second
	}
	return &Relay{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.Timeout},
	}
}

// Enabled — cek apakah relay ke web builder aktif. Kalau URL kosong,
// receiver tetap terima + verify + audit, tapi tidak forward (log warn).
func (r *Relay) Enabled() bool {
	return r.cfg.WebbuilderURL != ""
}

// VerifyUpstream — cek signature registrar-api. Return error kalau
// invalid; nil kalau OK atau secret kosong (dev mode).
func (r *Relay) VerifyUpstream(headerSig, headerTs string, body []byte) error {
	if r.cfg.UpstreamSecret == "" {
		// Dev mode: skip verify — return nil.
		return nil
	}
	if headerSig == "" {
		return errors.New("missing upstream signature header")
	}
	if !strings.HasPrefix(headerSig, "sha256=") {
		return errors.New("upstream signature scheme harus sha256=")
	}
	sig, err := hex.DecodeString(strings.TrimPrefix(headerSig, "sha256="))
	if err != nil {
		return fmt.Errorf("upstream signature invalid hex: %w", err)
	}

	// Registrar-api PANDI compute HMAC dari raw body (no timestamp). Ada
	// beberapa varian di industry — untuk MVP asumsi HMAC(secret, body).
	// Kalau schema beda (mis. ts + body), sesuaikan di sini.
	mac := hmac.New(sha256.New, []byte(r.cfg.UpstreamSecret))
	mac.Write(body)
	expected := mac.Sum(nil)

	if subtle.ConstantTimeCompare(sig, expected) != 1 {
		return errors.New("upstream signature mismatch")
	}
	// Timestamp check opsional — kalau ada, cegah replay.
	if headerTs != "" {
		var ts int64
		if _, err := fmt.Sscanf(headerTs, "%d", &ts); err == nil {
			if time.Since(time.Unix(ts, 0)).Abs() > 15*time.Minute {
				return errors.New("upstream timestamp expired (>15 menit)")
			}
		}
	}
	return nil
}

// Forward — kirim body ke web builder dengan HMAC signing api-registry
// sendiri. Return upstream status code + response body untuk audit trail.
//
// Contract signing: sama dengan security.HMACMiddleware supaya web builder
// pakai code path yang sama untuk verify api-registry:
//
//   sha256(secret, ts + "." + POST + PATH + "." + body)
func (r *Relay) Forward(ctx context.Context, body []byte) (int, string, error) {
	if !r.Enabled() {
		return 0, "", errors.New("relay disabled: WEBBUILDER_URL kosong")
	}

	req, err := http.NewRequestWithContext(ctx, "POST", r.cfg.WebbuilderURL, bytes.NewReader(body))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	// Extract path untuk signing (path-only, tanpa host + query yang tidak ada).
	path := extractPath(r.cfg.WebbuilderURL)

	if r.cfg.WebbuilderSecret != "" {
		ts := fmt.Sprintf("%d", time.Now().Unix())
		mac := hmac.New(sha256.New, []byte(r.cfg.WebbuilderSecret))
		mac.Write([]byte(ts))
		mac.Write([]byte{'.'})
		mac.Write([]byte("POST"))
		mac.Write([]byte(path))
		mac.Write([]byte{'.'})
		mac.Write(body)
		req.Header.Set("X-Timestamp", ts)
		req.Header.Set("X-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	resp, err := r.http.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(respBody), nil
}

// extractPath — ambil path dari full URL. "/webhook" saja kalau parse gagal.
func extractPath(rawURL string) string {
	// Simple — trim scheme+host bagian.
	// Cukup untuk URL sederhana; kalau butuh robust, pakai net/url.
	if idx := strings.Index(rawURL, "://"); idx >= 0 {
		rest := rawURL[idx+3:]
		if slash := strings.Index(rest, "/"); slash >= 0 {
			return rest[slash:]
		}
	}
	return "/"
}

// LogEvent — helper: struktur log kalau forward gagal atau signature invalid.
// Dipanggil dari handler untuk konsisten format audit.
func (r *Relay) LogEvent(msg string, attrs ...any) {
	slog.Info("webhook: "+msg, attrs...)
}
