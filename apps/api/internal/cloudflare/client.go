package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
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

// GetZoneByDomain lookup zone by exact domain name. Cloudflare filter via
// `?name=<domain>` — response array (empty kalau tidak ada). Cukup untuk
// UI DNS editor yang perlu resolve zone_id sebelum operasi record.
//
// Docs: https://developers.cloudflare.com/api/operations/zones-get
func (c *Client) GetZoneByDomain(ctx context.Context, domain string) (*ZoneData, error) {
	q := url.Values{}
	q.Set("name", domain)
	q.Set("account.id", c.cfg.AccountID)
	q.Set("per_page", "1")

	raw, status, err := c.do(ctx, http.MethodGet, "/zones?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	var out ZoneListResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("cloudflare: decode zones: %w (body: %s)", err, snip(raw))
	}
	if !out.Success || status >= 300 {
		return nil, apiErr(status, out.Errors, raw)
	}
	if len(out.Result) == 0 {
		return nil, ErrZoneNotFound
	}
	return &out.Result[0], nil
}

// ListDNSRecords fetch semua record di zone. Cloudflare default per_page=100
// yang cukup untuk MVP; kalau user punya >100 record, pakai pagination.
// Untuk sekarang set per_page tinggi (max 5000 per docs) untuk hindari
// pagination client-side.
//
// Docs: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-list-dns-records
func (c *Client) ListDNSRecords(ctx context.Context, zoneID string) ([]DNSRecordData, error) {
	raw, status, err := c.do(ctx, http.MethodGet, "/zones/"+zoneID+"/dns_records?per_page=500", nil)
	if err != nil {
		return nil, err
	}
	var out DNSRecordListResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("cloudflare: decode dns list: %w (body: %s)", err, snip(raw))
	}
	if !out.Success || status >= 300 {
		return nil, apiErr(status, out.Errors, raw)
	}
	return out.Result, nil
}

// UpdateDNSRecord PATCH single record. Cloudflare accept PATCH untuk partial
// update; kita kirim full payload karena semantic form UI (user edit semua
// field sekaligus). Server tetap validate.
//
// Docs: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-patch-dns-record
func (c *Client) UpdateDNSRecord(ctx context.Context, zoneID, recordID string, req DNSRecordRequest) (*DNSRecordData, error) {
	if req.TTL == 0 {
		req.TTL = 1
	}
	body, _ := json.Marshal(req)
	raw, status, err := c.do(ctx, http.MethodPatch,
		"/zones/"+zoneID+"/dns_records/"+recordID, body)
	if err != nil {
		return nil, err
	}
	var out DNSRecordResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("cloudflare: decode dns: %w (body: %s)", err, snip(raw))
	}
	if !out.Success || status >= 300 {
		return nil, apiErr(status, out.Errors, raw)
	}
	return &out.Result, nil
}

// DeleteDNSRecord hapus record permanen.
//
// Docs: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-delete-dns-record
func (c *Client) DeleteDNSRecord(ctx context.Context, zoneID, recordID string) error {
	raw, status, err := c.do(ctx, http.MethodDelete,
		"/zones/"+zoneID+"/dns_records/"+recordID, nil)
	if err != nil {
		return err
	}
	if status >= 300 {
		var out DNSRecordResponse
		_ = json.Unmarshal(raw, &out)
		return apiErr(status, out.Errors, raw)
	}
	return nil
}

// ErrZoneNotFound signal domain tidak terdaftar di Cloudflare akun ini —
// caller boleh return 404/friendly message ke user (mis. "domain belum
// aktif di Cloudflare, tunggu provisioning selesai").
var ErrZoneNotFound = errors.New("cloudflare: zone not found")

// PurgeCache invalidates CDN edge cache untuk zone. Dua mode:
//   - urls non-empty: purge by URL (max 30 per request per docs)
//   - urls kosong: purge_everything (semua asset di zone)
//
// Dipanggil setelah user publish page/site supaya perubahan langsung
// terlihat tanpa tunggu edge TTL. Fire-and-forget dari caller — kalau
// fail, cache tetap expire natural (worst-case delay = TTL).
//
// Docs: https://developers.cloudflare.com/api/operations/zone-purge
func (c *Client) PurgeCache(ctx context.Context, zoneID string, urls []string) error {
	var payload map[string]any
	if len(urls) == 0 {
		payload = map[string]any{"purge_everything": true}
	} else {
		// CF limit 30 URL per call. Truncate silent kalau caller lebih —
		// purge_everything mode lebih baik kalau lebih dari 30 URL.
		if len(urls) > 30 {
			urls = urls[:30]
		}
		payload = map[string]any{"files": urls}
	}
	body, _ := json.Marshal(payload)
	raw, status, err := c.do(ctx, http.MethodPost, "/zones/"+zoneID+"/purge_cache", body)
	if err != nil {
		return err
	}
	if status >= 300 {
		var out DNSRecordResponse // reuse envelope shape (success + errors)
		_ = json.Unmarshal(raw, &out)
		return apiErr(status, out.Errors, raw)
	}
	return nil
}

// do adalah low-level helper — dipakai method baru supaya tidak duplicate
// setup header + read body. Method existing (CreateZone, CreateDNSRecord)
// tetap inline untuk minimalisasi diff.
func (c *Client) do(ctx context.Context, method, path string, body []byte) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("cloudflare: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return raw, resp.StatusCode, nil
}

func apiErr(status int, errs []Error, raw []byte) error {
	if len(errs) > 0 {
		return fmt.Errorf("cloudflare api %d: %s (code %d)",
			status, errs[0].Message, errs[0].Code)
	}
	return fmt.Errorf("cloudflare api %d: %s", status, snip(raw))
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

// VerifyToken cek apakah API token valid + active.
// Dipakai UI admin untuk validate credentials sebelum save.
//
// Cloudflare punya 2 tipe token dengan endpoint verify berbeda:
//   - User API Token (klasik, tanpa prefix) → GET /user/tokens/verify
//   - Account-Owned Token (baru, prefix "cfat_") → GET /accounts/{id}/tokens/verify
//
// Auto-detect: kalau token diawali "cfat_" DAN AccountID di-set, pakai endpoint
// account. Selain itu, pakai endpoint user. Kalau user endpoint fail dengan
// 404 (token tidak ditemukan di scope user), fallback ke account endpoint
// supaya operator tidak perlu tahu jenis token yang dipakai.
//
// Docs:
//   User: https://developers.cloudflare.com/api/operations/user-api-tokens-verify-token
//   Account: https://developers.cloudflare.com/api/operations/account-api-tokens-verify-token
func (c *Client) VerifyToken(ctx context.Context) error {
	// Pilih endpoint berdasarkan token prefix. cfat_ = account-owned token
	// (introduced 2023). Fallback: user endpoint kalau prefix bukan cfat_ /
	// AccountID kosong.
	tokenIsAccountOwned := strings.HasPrefix(c.cfg.APIToken, "cfat_")
	var primary, fallback string
	if tokenIsAccountOwned && c.cfg.AccountID != "" {
		primary = baseURL + "/accounts/" + c.cfg.AccountID + "/tokens/verify"
		fallback = baseURL + "/user/tokens/verify"
	} else {
		primary = baseURL + "/user/tokens/verify"
		if c.cfg.AccountID != "" {
			fallback = baseURL + "/accounts/" + c.cfg.AccountID + "/tokens/verify"
		}
	}

	err := c.verifyTokenAt(ctx, primary)
	if err == nil {
		return nil
	}
	// Fallback hanya kalau primary balik 404/401 (token bukan di scope itu).
	// Kalau primary error network / 500, jangan fallback — user butuh liat error
	// asli.
	if fallback != "" && isTokenScopeMismatch(err) {
		if err2 := c.verifyTokenAt(ctx, fallback); err2 == nil {
			return nil
		}
	}
	return err
}

// verifyTokenAt hits 1 endpoint. Extracted supaya bisa retry di endpoint
// alternatif tanpa duplicate code.
func (c *Client) verifyTokenAt(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
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

// isTokenScopeMismatch — deteksi error yang indikasi token bukan di scope
// endpoint (mis. account-owned token di-verify via /user/*). CF response biasanya
// 401 dengan code 1000 "Invalid API Token" atau 404. Substring check karena
// error message dari verifyTokenAt sudah include HTTP status.
func isTokenScopeMismatch(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "(401)") ||
		strings.Contains(msg, "(404)") ||
		strings.Contains(msg, "\"code\":1000")
}

func snip(b []byte) string {
	const max = 256
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "…"
}
