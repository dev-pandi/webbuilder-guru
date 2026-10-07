// Package dnscloud is the HTTP client for DNSCloud.ID API v1.
// Spec: https://dnscloud.id/api (OpenAPI 3.1).
//
// Error model: application/problem+json (RFC 9457). The `code` field is
// stable per the spec and safe to pattern-match in callers. `detail` is
// human-readable Bahasa Indonesia — surfaced directly to admin on test
// connection, logged for lifecycle ops.
//
// Auth: Bearer `dcid_...` token issued via DNSCloud panel (API cannot mint
// tokens by design). Admin inserts token via /admin/dns-providers UI.
package dnscloud

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

	"github.com/webbuilder/api/internal/dnsprovider"
)

const DefaultBaseURL = "https://api.dnscloud.id/v1"

type Config struct {
	BaseURL  string
	APIToken string
	Timeout  time.Duration
}

type Client struct {
	cfg  Config
	http *http.Client
}

func NewClient(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultBaseURL
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 15 * time.Second
	}
	return &Client{cfg: cfg, http: &http.Client{Timeout: cfg.Timeout}}
}

// --- Error handling ---------------------------------------------------------

// Problem is the RFC 9457 shape returned on error. `Code` is the stable
// enum (UPPERCASE_SNAKE).
type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
	Code   string `json:"code"`
	Errors []struct {
		Field   string `json:"field"`
		Message string `json:"message"`
	} `json:"errors,omitempty"`
}

func (p *Problem) Error() string {
	if p.Detail != "" {
		return "dnscloud: " + p.Code + " — " + p.Detail
	}
	return "dnscloud: " + p.Code
}

// IsCode reports whether err matches a specific stable code (RFC 9457 `code`).
func IsCode(err error, code string) bool {
	var p *Problem
	if errors.As(err, &p) {
		return p.Code == code
	}
	return false
}

// ErrZoneNotFound signals a zone that no longer exists (useful for idempotent
// delete).
var ErrZoneNotFound = errors.New("dnscloud: zone not found")

// --- Low-level HTTP ---------------------------------------------------------

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("dnscloud: encode body: %w", err)
		}
		reader = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.BaseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("dnscloud: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		if strings.Contains(resp.Header.Get("Content-Type"), "problem+json") {
			var p Problem
			if json.Unmarshal(raw, &p) == nil && p.Code != "" {
				return &p
			}
		}
		return fmt.Errorf("dnscloud %d: %s", resp.StatusCode, snip(raw))
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("dnscloud: decode: %w (body: %s)", err, snip(raw))
		}
	}
	return nil
}

func snip(b []byte) string {
	s := string(b)
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}

// --- Zone operations --------------------------------------------------------

type createZoneReq struct {
	Name string `json:"name"`
}

type createZoneResp struct {
	Zone struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	} `json:"zone"`
	Delegation struct {
		Nameservers []string `json:"nameservers"`
		Instruksi   string   `json:"instruksi"`
	} `json:"delegation"`
}

// Ping is a lightweight auth-only probe for the admin "test connection"
// button. Hits GET /zones?limit=1 — a token-friendly endpoint that returns
// 200 (even with zero zones) for a valid API token.
//
// NOTE: /auth/me is NOT usable here. Per DNSCloud spec, identity + membership
// endpoints (auth/*, members/*, orgs/*) reject API tokens with 403 because
// they bind to "who are you" — a question only a panel session answers. Our
// admin UI only ever carries tokens, so we must probe a resource-oriented
// endpoint instead.
func (c *Client) Ping(ctx context.Context) error {
	return c.do(ctx, http.MethodGet, "/zones?limit=1", nil, nil)
}

// --- Provider adapter (dnsprovider.Provider) --------------------------------

type Provider struct {
	client *Client
}

func NewProvider(c *Client) *Provider { return &Provider{client: c} }

func (p *Provider) Kind() dnsprovider.Kind { return dnsprovider.KindDNSCloud }

func (p *Provider) CreateZone(ctx context.Context, domain string) (*dnsprovider.Zone, error) {
	var resp createZoneResp
	if err := p.client.do(ctx, http.MethodPost, "/zones", createZoneReq{Name: domain}, &resp); err != nil {
		return nil, err
	}
	return &dnsprovider.Zone{
		ID:          resp.Zone.ID,
		Nameservers: resp.Delegation.Nameservers,
	}, nil
}

// UpsertRecord uses PUT /zones/{zone}/rrsets/{name}/{type} which is
// atomic replace-all for the RRset. Rdata shape depends on type — we build
// the minimal shape per RFC-ish mapping.
func (p *Provider) UpsertRecord(ctx context.Context, zoneID string, rec dnsprovider.Record) error {
	rdata, err := recordToRdata(rec)
	if err != nil {
		return err
	}
	body := map[string]any{
		"records": []map[string]any{rdata},
	}
	if rec.TTL > 0 {
		body["ttl"] = rec.TTL
	}
	path := fmt.Sprintf("/zones/%s/rrsets/%s/%s",
		urlEscape(zoneID), urlEscape(rec.Name), urlEscape(rec.Type))
	return p.client.do(ctx, http.MethodPut, path, body, nil)
}

// EnableProxy flips edge proxy (orange cloud) for a hostname. Uses sensible
// defaults: TLS mode "ketat" (= CF Full Strict), WAF "blokir" default.
func (p *Provider) EnableProxy(ctx context.Context, zoneID, hostname string) error {
	body := map[string]any{
		"proxied":  true,
		"mode_tls": "ketat",
	}
	path := fmt.Sprintf("/zones/%s/proxy/%s", urlEscape(zoneID), urlEscape(hostname))
	return p.client.do(ctx, http.MethodPut, path, body, nil)
}

// QueueVerify triggers the server-side delegation check. Rate-limited 1/min
// per zone by DNSCloud; a 429 here is OK — just means another check is
// already pending.
func (p *Provider) QueueVerify(ctx context.Context, zoneID string) error {
	path := fmt.Sprintf("/zones/%s/verification/check", urlEscape(zoneID))
	err := p.client.do(ctx, http.MethodPost, path, nil, nil)
	if err != nil && IsCode(err, "RATE_LIMITED") {
		// Already queued — not fatal, caller polls CheckVerify.
		return nil
	}
	return err
}

type verificationStatusResp struct {
	// DNSCloud's actual shape is loose: `status`, `queued`, timestamps,
	// per-nameserver reports. We extract the minimum we need.
	Status      string `json:"status"`
	Delegated   bool   `json:"delegated"`
	NextCheckAt string `json:"next_check_at,omitempty"`
	Detail      string `json:"detail,omitempty"`
}

// CheckVerify reads the cached delegation state from DNSCloud. assignedNS is
// ignored here (unlike the CF adapter) because DNSCloud itself knows which
// nameservers it issued.
func (p *Provider) CheckVerify(ctx context.Context, zoneID, hostname string, assignedNS []string) (*dnsprovider.VerifyStatus, error) {
	path := fmt.Sprintf("/zones/%s/verification", urlEscape(zoneID))
	var out verificationStatusResp
	if err := p.client.do(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	// DNSCloud reports several states; we normalize to our 3-flag model.
	// Treat `delegated=true` or status containing "active"/"ok" as verified.
	verified := out.Delegated || strings.Contains(strings.ToLower(out.Status), "active") || strings.Contains(strings.ToLower(out.Status), "ok")
	// Treat "pending" / "queued" / empty status as still-checking.
	pending := !verified && (out.Status == "" ||
		strings.Contains(strings.ToLower(out.Status), "pending") ||
		strings.Contains(strings.ToLower(out.Status), "queued"))
	return &dnsprovider.VerifyStatus{
		Verified: verified,
		Pending:  pending,
		Detail:   out.Detail,
	}, nil
}

// DeleteZone performs a soft-delete (DNSCloud retains data for 7 days per
// spec). Idempotent: 404 is swallowed as success so orphan reconciler is
// safe to retry.
func (p *Provider) DeleteZone(ctx context.Context, zoneID string) error {
	path := fmt.Sprintf("/zones/%s", urlEscape(zoneID))
	err := p.client.do(ctx, http.MethodDelete, path, nil, nil)
	if err != nil {
		var pr *Problem
		if errors.As(err, &pr) && pr.Status == http.StatusNotFound {
			return nil
		}
		if strings.Contains(err.Error(), " 404:") {
			return nil
		}
		return err
	}
	return nil
}

// --- RRset payload shaping --------------------------------------------------

// recordToRdata produces the per-type rdata object. Only the record types
// our BYO/purchase flows need are handled; adding more is additive.
func recordToRdata(rec dnsprovider.Record) (map[string]any, error) {
	switch strings.ToUpper(rec.Type) {
	case "A", "AAAA":
		return map[string]any{"ip": rec.Content}, nil
	case "CNAME":
		return map[string]any{"target": rec.Content}, nil
	case "TXT":
		return map[string]any{"text": rec.Content}, nil
	case "NS":
		return map[string]any{"nsdname": rec.Content}, nil
	}
	return nil, fmt.Errorf("dnscloud: unsupported record type %q", rec.Type)
}

// urlEscape is a tiny wrapper — path components are URL-escaped so names
// like "@" or non-ASCII characters survive the HTTP round-trip.
func urlEscape(s string) string {
	// url.PathEscape is sufficient; keep import local to this file.
	return pathEscape(s)
}

// pathEscape is split out for easy swap to a different escape policy
// without churning call sites.
func pathEscape(s string) string {
	// Inline implementation of url.PathEscape to avoid pulling net/url when
	// the rest of the file doesn't need it. Replaces only characters that
	// need escaping in a path segment per RFC 3986.
	const upper = "0123456789ABCDEF"
	buf := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case 'A' <= c && c <= 'Z', 'a' <= c && c <= 'z', '0' <= c && c <= '9',
			c == '-' || c == '_' || c == '.' || c == '~':
			buf = append(buf, c)
		default:
			buf = append(buf, '%', upper[c>>4], upper[c&15])
		}
	}
	return string(buf)
}
