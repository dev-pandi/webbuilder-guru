// Package registrar is a thin, typed HTTP client for the registrar-api
// service (github.com/pandi-rofai/registrar-api) that handles the actual
// domain lifecycle — EPP registration, WHOIS, payment gateways.
//
// This client only lets the web builder ACT AS A RESELLER. It does not
// replicate registrar business logic; every "expensive" operation
// (register, renew, transfer, WHOIS lookup) is one HTTP round-trip.
//
// Design principles:
//   - No global state. Construct once in main, inject into handlers.
//   - Fail fast on network errors; retry only on transient (5xx / timeout).
//   - Errors are typed (APIError) so callers can pattern-match by HTTP status
//     and business code instead of string-matching an error message.
//   - Everything is context-aware — no request escapes cancellation.
package registrar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/webbuilder/api/internal/metrics"
)

// Config bundles the runtime knobs. BaseURL is the ONLY required field;
// APIKey is required for any endpoint that needs auth (all reseller ones).
type Config struct {
	BaseURL string        // e.g. "https://registrar-api.pandi.internal"
	APIKey  string        // service-account bearer token; empty = anonymous public endpoints only
	Timeout time.Duration // per-request; default 15s
	Retries int           // total attempts on transient failure; default 2 (= 1 retry)

	// HTTPClient is optional. Provide your own for testing or if you need
	// custom transport (proxy, mTLS). Nil = built-in http.Client with Timeout.
	HTTPClient *http.Client
}

// Client is the typed handle over registrar-api. Concurrency-safe.
//
// apiKey adalah long-lived JWT reseller (default TTL 30 hari di registrar).
// Guarded oleh mu supaya background JWT refresh loop bisa Set-nya tanpa
// data race dengan handler yang lagi read.
type Client struct {
	baseURL string
	mu      sync.RWMutex // guards apiKey + credEmail/credPassword
	apiKey  string

	// Credentials untuk auto-recover kalau JWT ditolak 401 (mis. registrar
	// revoke di tengah siklus 25-day refresh). Set via SetCredentials — kalau
	// kosong, 401 tetap propagate ke caller.
	credEmail    string
	credPassword string

	// reauthMu serialize reauth: kalau 10 request 401 bersamaan, hanya 1 yang
	// login; sisanya menunggu + pakai JWT baru. Terpisah dari mu supaya
	// APIKey() reads tetap cepat.
	reauthMu sync.Mutex

	http    *http.Client
	retries int
}

// APIKey returns the current JWT (thread-safe read).
func (c *Client) APIKey() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.apiKey
}

// SetAPIKey rotates the JWT. Called oleh background refresh loop (di main.go)
// setelah re-login. Safe untuk dipanggil concurrent dengan request handler.
func (c *Client) SetAPIKey(newKey string) {
	c.mu.Lock()
	c.apiKey = newKey
	c.mu.Unlock()
}

// SetCredentials aktifkan JWT 401 auto-recover. Setelah dipanggil, `do` akan
// try Login+retry sekali kalau dapat 401 (JWT invalid di tengah siklus refresh
// karena registrar revoke, rotate credentials, dst.).
//
// Kosongkan salah satu untuk disable (mis. static-key deployment).
func (c *Client) SetCredentials(email, password string) {
	c.mu.Lock()
	c.credEmail = email
	c.credPassword = password
	c.mu.Unlock()
}

// hasCredentials — true kalau auto-recover eligible.
func (c *Client) hasCredentials() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.credEmail != "" && c.credPassword != ""
}

// tryReauth login pakai stored credentials + SetAPIKey. Serialized via
// reauthMu — concurrent 401 tidak trigger multiple login. Return true kalau
// key sudah fresh (either kita yang login, atau goroutine lain sudah).
//
// Optimization: kalau apiKey sudah berubah sejak snapshot yang dilihat caller,
// skip login dan pakai key baru. Untuk simplicity, snapshot dibandingkan
// via parameter `staleKey`.
func (c *Client) tryReauth(ctx context.Context, staleKey string) bool {
	c.reauthMu.Lock()
	defer c.reauthMu.Unlock()

	// Double-check: kalau apiKey sudah berubah, someone else did the work.
	if cur := c.APIKey(); cur != staleKey && cur != "" {
		metrics.Default.CounterInc("registrar_jwt_reauth_total",
			"Auto-recover login attempts by result",
			map[string]string{"result": "skipped_racewin"},
		)
		return true
	}
	c.mu.RLock()
	email, password := c.credEmail, c.credPassword
	c.mu.RUnlock()
	if email == "" || password == "" {
		return false
	}

	// Login pakai timeout ketat — jangan blok request path terlalu lama.
	loginCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	jwt, err := c.Login(loginCtx, email, password)
	if err != nil {
		metrics.Default.CounterInc("registrar_jwt_reauth_total",
			"Auto-recover login attempts by result",
			map[string]string{"result": "failed"},
		)
		return false
	}
	c.SetAPIKey(jwt)
	metrics.Default.CounterInc("registrar_jwt_reauth_total",
		"Auto-recover login attempts by result",
		map[string]string{"result": "success"},
	)
	return true
}

// New returns nil if BaseURL is empty (feature disabled). Otherwise it
// validates the URL is absolute + returns a ready-to-use client.
func New(cfg Config) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, nil
	}
	if !strings.HasPrefix(cfg.BaseURL, "http://") && !strings.HasPrefix(cfg.BaseURL, "https://") {
		return nil, fmt.Errorf("registrar: BaseURL must be absolute (got %q)", cfg.BaseURL)
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 15 * time.Second
	}
	if cfg.Retries <= 0 {
		cfg.Retries = 2
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: cfg.Timeout}
	}
	return &Client{
		baseURL: strings.TrimRight(cfg.BaseURL, "/"),
		apiKey:  cfg.APIKey,
		http:    hc,
		retries: cfg.Retries,
	}, nil
}

// APIError is the typed error returned when registrar-api responds with a
// non-2xx status. Callers can `errors.As(err, &apiErr)` to branch on Status
// (network vs 4xx vs 5xx) or Code (business error taxonomy).
type APIError struct {
	Status int    // HTTP status code
	Code   string // business error code from response body (may be empty)
	Msg    string // human-readable message from response body
}

func (e *APIError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("registrar api %d [%s]: %s", e.Status, e.Code, e.Msg)
	}
	return fmt.Sprintf("registrar api %d: %s", e.Status, e.Msg)
}

// IsAPIError reports whether the error came from an HTTP response (as opposed
// to a network/timeout error). Convenience so callers don't wrangle errors.As.
func IsAPIError(err error) bool {
	var e *APIError
	return errors.As(err, &e)
}

// do issues a single HTTP call with auth + retry. `out` may be nil when the
// caller doesn't care about the body (e.g. 204 No Content).
//
// Retry policy: transient failures (network error, 502/503/504) are retried
// with a small exponential backoff. 4xx are never retried — they signify a
// caller mistake and will fail identically on retry.
func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	url := c.baseURL + path

	// Serialize body once — reused across retries.
	var payload []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("registrar: marshal body: %w", err)
		}
		payload = b
	}

	// reauthed = true kalau kita sudah trigger auto-recover di request ini.
	// Cegah loop kalau login sukses tapi JWT baru masih ditolak 401 (mis. bug
	// permissions upstream) — daripada infinite reauth.
	var reauthed bool
	// Skip Login path sendiri untuk reauth — kalau login endpoint balik 401,
	// itu credential invalid, tidak boleh dipakai jadi trigger reauth ulang.
	isLoginPath := strings.HasSuffix(path, "/v1/api/user/login")

	var lastErr error
	for attempt := 0; attempt < c.retries; attempt++ {
		if attempt > 0 {
			// Exponential backoff 200ms, 400ms — bounded so we don't stall
			// the request handler. Context cancellation short-circuits.
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(200*attempt) * time.Millisecond):
			}
		}

		var reader io.Reader
		if payload != nil {
			reader = bytes.NewReader(payload)
		}
		req, err := http.NewRequestWithContext(ctx, method, url, reader)
		if err != nil {
			return fmt.Errorf("registrar: build request: %w", err)
		}
		req.Header.Set("Accept", "application/json")
		if payload != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		currentKey := c.APIKey()
		if currentKey != "" {
			// Bearer scheme is the standard reseller pattern; if registrar-api
			// prefers X-API-Key header later, only this line changes.
			req.Header.Set("Authorization", "Bearer "+currentKey)
		}

		resp, err := c.http.Do(req)
		if err != nil {
			// Network / timeout — retry unless context is done.
			lastErr = fmt.Errorf("registrar: %s %s: %w", method, path, err)
			continue
		}

		raw, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("registrar: read body: %w", readErr)
			continue
		}

		// Success.
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if out == nil || len(raw) == 0 {
				return nil
			}
			if err := json.Unmarshal(raw, out); err != nil {
				return fmt.Errorf("registrar: decode response: %w (body: %s)", err, snip(raw))
			}
			return nil
		}

		apiErr := decodeError(resp.StatusCode, raw)

		// 401 auto-recover: JWT invalid (revoke / rotate). Coba re-login sekali
		// pakai stored credentials, lalu retry request ini. Consume slot retry
		// yang sama — kalau login gagal atau retry masih 401, propagate.
		if resp.StatusCode == 401 && !reauthed && !isLoginPath && c.hasCredentials() {
			reauthed = true
			if c.tryReauth(ctx, currentKey) {
				lastErr = apiErr
				continue
			}
		}

		// Retry only on transient server errors. 4xx (kecuali 401 di atas) =
		// caller mistake.
		if resp.StatusCode >= 500 && resp.StatusCode <= 599 {
			lastErr = apiErr
			continue
		}
		return apiErr
	}

	if lastErr == nil {
		lastErr = errors.New("registrar: request failed after retries")
	}
	return lastErr
}

// decodeError extracts { "error": { "code", "message" } } if present.
// Falls back to the raw body when the shape doesn't match — better to leak a
// bit of the response than swallow a useful diagnostic.
func decodeError(status int, raw []byte) *APIError {
	var wire struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"` // some endpoints use flat message
	}
	msg := ""
	code := ""
	if err := json.Unmarshal(raw, &wire); err == nil {
		if wire.Error.Message != "" {
			code = wire.Error.Code
			msg = wire.Error.Message
		} else if wire.Message != "" {
			msg = wire.Message
		}
	}
	if msg == "" {
		msg = snip(raw)
	}
	return &APIError{Status: status, Code: code, Msg: msg}
}

// snip caps body previews so log lines don't blow up on huge error dumps.
func snip(b []byte) string {
	const max = 256
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "…"
}
