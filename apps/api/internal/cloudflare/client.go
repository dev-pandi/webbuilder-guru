package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client thin wrapper Cloudflare API v4. Per-config karena token + account_id
// bisa beda antar reseller/tenant — bikin instance baru via NewClient(cfg)
// setiap kali panggil, hemat memory + tidak share state.
//
// Kalau di future butuh caching zone info, tambahkan struct-level state.
// Untuk MVP, stateless.

const baseURL = "https://api.cloudflare.com/client/v4"

type Client struct {
	cfg  Config
	http *http.Client
}

func NewClient(cfg Config) *Client {
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: 15 * time.Second},
	}
}

// CreateZone daftarkan domain ke akun Cloudflare + return NS assignment.
// Type "full" = Cloudflare jadi authoritative DNS (butuh NS switch). Alt
// "partial" (CNAME setup) tidak dipakai untuk web builder karena kita mau
// full DNS control.
//
// Cloudflare docs: https://developers.cloudflare.com/api/operations/zones-post
func (c *Client) CreateZone(ctx context.Context, domain string) (*ZoneData, error) {
	payload := map[string]any{
		"name": domain,
		"type": "full",
		"account": map[string]string{
			"id": c.cfg.AccountID,
		},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/zones", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cloudflare: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var out CreateZoneResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("cloudflare: decode: %w (body: %s)", err, snip(raw))
	}
	if !out.Success || resp.StatusCode >= 300 {
		if len(out.Errors) > 0 {
			return nil, fmt.Errorf("cloudflare api %d: %s (code %d)",
				resp.StatusCode, out.Errors[0].Message, out.Errors[0].Code)
		}
		return nil, fmt.Errorf("cloudflare api %d: %s", resp.StatusCode, snip(raw))
	}
	if len(out.Result.NameServers) == 0 {
		return nil, errors.New("cloudflare: response tidak berisi name_servers")
	}
	return &out.Result, nil
}

// CreateDNSRecord daftarkan record baru di zone. Dipanggil setelah CreateZone
// untuk arahkan domain ke platform IP:
//   - A record `@` → PLATFORM_IP (proxied via CF edge)
//   - CNAME `www` → root (proxied via CF edge)
//
// Duplicate detection ada di CF side (return error 81057 kalau record sudah
// ada); caller boleh treat itu sebagai success (idempotent retry).
//
// Cloudflare docs: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record
func (c *Client) CreateDNSRecord(ctx context.Context, zoneID string, req DNSRecordRequest) (*DNSRecordData, error) {
	if req.TTL == 0 {
		req.TTL = 1 // auto
	}
	body, _ := json.Marshal(req)
	url := baseURL + "/zones/" + zoneID + "/dns_records"

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("cloudflare: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var out DNSRecordResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("cloudflare: decode dns: %w (body: %s)", err, snip(raw))
	}
	if !out.Success || resp.StatusCode >= 300 {
		if len(out.Errors) > 0 {
			return nil, fmt.Errorf("cloudflare dns api %d: %s (code %d)",
				resp.StatusCode, out.Errors[0].Message, out.Errors[0].Code)
		}
		return nil, fmt.Errorf("cloudflare dns api %d: %s", resp.StatusCode, snip(raw))
	}
	return &out.Result, nil
}

// IsCloudflareDuplicateRecord cek error code 81057 (record sudah ada) — safe
// di-treat sebagai success saat auto-attach re-run untuk domain yang sudah
// pernah setup.
func IsCloudflareDuplicateRecord(err error) bool {
	if err == nil {
		return false
	}
	// Sederhana: string match. Cukup untuk MVP; kalau butuh presisi, parse
	// APIError struct dan bandingkan .Code.
	return contains(err.Error(), "81057")
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// VerifyToken cek apakah API token valid + punya scope minimal (Zone:Edit).
// Dipakai UI admin untuk validate credentials sebelum save.
//
// Cloudflare docs: https://developers.cloudflare.com/api/operations/user-api-tokens-verify-token
func (c *Client) VerifyToken(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/user/tokens/verify", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("cloudflare: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("cloudflare token invalid (%d): %s", resp.StatusCode, snip(raw))
	}
	return nil
}

func snip(b []byte) string {
	const max = 256
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "…"
}
