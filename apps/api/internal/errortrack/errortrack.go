// Package errortrack ships exceptions to a Sentry-compatible endpoint.
//
// Why not getsentry/sentry-go? The full SDK pulls breadcrumbs, performance
// monitoring, sampling, transports, attachments — overkill for what we need
// here (panic + 5xx capture). A minimal POST to the DSN's /store/ endpoint
// works against Sentry SaaS, self-hosted Sentry, and GlitchTip alike.
//
// If we ever outgrow this — add the official SDK then; the Capture surface
// stays the same.
package errortrack

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"sync"
	"time"
)

const sdkName = "web-builder-errortrack/0.1"

// Client is what callers hold. Safe for concurrent use. Cheap to create —
// zero value is a noop Client (DSN empty), so unconditional Capture is fine.
type Client struct {
	endpoint string
	authHdr  string
	http     *http.Client
	enabled  bool
	env      string
	release  string

	mu     sync.Mutex
	dedupe map[string]time.Time // fingerprint -> last sent (5min cool-off)
}

// Init parses the DSN and returns a Client. Empty DSN -> disabled client
// (Capture becomes a noop). Returns error only on malformed DSN.
func Init(dsn, env, release string) (*Client, error) {
	c := &Client{
		http:   &http.Client{Timeout: 5 * time.Second},
		env:    env,
		release: release,
		dedupe: make(map[string]time.Time),
	}
	if strings.TrimSpace(dsn) == "" {
		return c, nil
	}
	u, err := url.Parse(dsn)
	if err != nil {
		return c, fmt.Errorf("errortrack: invalid DSN: %w", err)
	}
	if u.User == nil || u.User.Username() == "" || u.Path == "" || u.Path == "/" {
		return c, fmt.Errorf("errortrack: DSN missing key or project_id")
	}
	key := u.User.Username()
	projectID := strings.Trim(u.Path, "/")
	c.endpoint = fmt.Sprintf("%s://%s/api/%s/store/", u.Scheme, u.Host, projectID)
	c.authHdr = fmt.Sprintf(
		"Sentry sentry_version=7, sentry_client=%s, sentry_key=%s",
		sdkName, key,
	)
	c.enabled = true
	return c, nil
}

// Enabled reports whether the client will send events. Useful for tests.
func (c *Client) Enabled() bool {
	if c == nil {
		return false
	}
	return c.enabled
}

// Capture sends an error event. Caller-supplied tags survive into the event.
// Best-effort: failure is logged and swallowed (don't disrupt request path).
func (c *Client) Capture(ctx context.Context, err error, tags map[string]string) {
	if c == nil || !c.enabled || err == nil {
		return
	}

	// Cheap dedupe: skip if same message sent in last 5 minutes. Stops one
	// loud panic from flooding Sentry with thousands of duplicate events.
	fp := err.Error()
	c.mu.Lock()
	if last, ok := c.dedupe[fp]; ok && time.Since(last) < 5*time.Minute {
		c.mu.Unlock()
		return
	}
	c.dedupe[fp] = time.Now()
	// Bound the map at 256 entries.
	if len(c.dedupe) > 256 {
		for k, t := range c.dedupe {
			if time.Since(t) > 10*time.Minute {
				delete(c.dedupe, k)
			}
		}
	}
	c.mu.Unlock()

	evt := event{
		EventID:    newEventID(),
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Level:      "error",
		Logger:     "go",
		Platform:   "go",
		Environment: c.env,
		Release:    c.release,
		Message:    err.Error(),
		Tags:       tags,
		Exception: &exception{Values: []exceptionValue{{
			Type:       fmt.Sprintf("%T", err),
			Value:      err.Error(),
			Stacktrace: captureStack(),
		}}},
	}

	go c.send(ctx, evt)
}

// CapturePanic is meant to be deferred from goroutine roots. It recovers any
// panic, reports it, and re-panics so default behaviour is preserved.
func (c *Client) CapturePanic(ctx context.Context, tags map[string]string) {
	r := recover()
	if r == nil {
		return
	}
	err, ok := r.(error)
	if !ok {
		err = fmt.Errorf("%v", r)
	}
	c.Capture(ctx, err, tags)
	panic(r) // preserve default panic semantics
}

func (c *Client) send(ctx context.Context, evt event) {
	body, err := json.Marshal(evt)
	if err != nil {
		slog.Error("errortrack: marshal failed", "error", err)
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		slog.Error("errortrack: request build failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sentry-Auth", c.authHdr)
	req.Header.Set("User-Agent", sdkName)

	resp, err := c.http.Do(req)
	if err != nil {
		slog.Error("errortrack: http send failed", "error", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Error("errortrack: server rejected event", "status", resp.StatusCode)
	}
}

// --- event types (subset of Sentry v7 schema) ---

type event struct {
	EventID     string            `json:"event_id"`
	Timestamp   string            `json:"timestamp"`
	Level       string            `json:"level"`
	Logger      string            `json:"logger"`
	Platform    string            `json:"platform"`
	Environment string            `json:"environment,omitempty"`
	Release     string            `json:"release,omitempty"`
	Message     string            `json:"message,omitempty"`
	Tags        map[string]string `json:"tags,omitempty"`
	Exception   *exception        `json:"exception,omitempty"`
}

type exception struct {
	Values []exceptionValue `json:"values"`
}

type exceptionValue struct {
	Type       string `json:"type"`
	Value      string `json:"value"`
	Stacktrace string `json:"stacktrace,omitempty"`
}

func newEventID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func captureStack() string {
	return string(debug.Stack())
}
