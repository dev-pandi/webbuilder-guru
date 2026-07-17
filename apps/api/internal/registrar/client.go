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
	"time"
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
type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
	retries int
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
		if c.apiKey != "" {
			// Bearer scheme is the standard reseller pattern; if registrar-api
			// prefers X-API-Key header later, only this line changes.
			req.Header.Set("Authorization", "Bearer "+c.apiKey)
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
		// Retry only on transient server errors. 4xx = caller mistake.
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
