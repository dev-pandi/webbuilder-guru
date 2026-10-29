package litera

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client — HTTP wrapper untuk Litera CMS endpoints. Config dibaca per-request
// via ConfigRepo supaya rotate API key langsung efektif (max TTL cache 60s).
type Client struct {
	cfg     *ConfigRepo
	domains *DomainRepo
	http    *http.Client
}

// NewClient — wire. HTTP client dengan 30s timeout per request (sesuai doc
// "60 req/menit" rate limit, tidak perlu long poll).
func NewClient(cfg *ConfigRepo, domains *DomainRepo) *Client {
	return &Client{
		cfg:     cfg,
		domains: domains,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// Register — POST /cms/articles/register. Dipanggil publish hook secara async.
// Return intent_id + embed_code.
func (c *Client) Register(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	cfg, err := c.cfg.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("litera: load config: %w", err)
	}
	if !cfg.IsReady() {
		return nil, ErrDisabled
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("litera: marshal register: %w", err)
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/cms/articles/register"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("litera: build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("litera: http do: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	corrID := extractCorrelationID(respBody)

	// Status mapping — translate HTTP status ke sentinel error.
	//
	// 202 ikut jalur sukses: Litera balas {"success":true} dengan intent
	// lengkap, statusnya REGISTERED (belum di-mint admin). Dulu 202 jatuh ke
	// default dan tercatat "Gagal" padahal artikel sudah terdaftar.
	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated, http.StatusAccepted:
		var out RegisterResponse
		if err := json.Unmarshal(respBody, &out); err != nil {
			return nil, fmt.Errorf("litera: decode response: %w", err)
		}
		slog.Info("litera register success",
			"intent_id", out.Data.Intent.ID, "intent_status", out.Data.Intent.Status,
			"http_status", resp.StatusCode, "correlation", corrID)
		return &out, nil
	case http.StatusUnauthorized:
		return nil, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)}
	case http.StatusForbidden:
		return nil, errors.Join(ErrDomainNotAllowed, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)})
	case http.StatusTooManyRequests:
		return nil, errors.Join(ErrRateLimit, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)})
	default:
		return nil, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)}
	}
}

// RegisterDomain — POST /cms/domains/register. Masukkan hostname ke CORS
// allowlist Litera. Idempoten menurut doc, jadi aman dipanggil ulang.
// Aktivasi allowlist butuh ≤60 detik setelah response sukses.
func (c *Client) RegisterDomain(ctx context.Context, hostname string) (*DomainRegisterResponse, error) {
	cfg, err := c.cfg.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("litera: load config: %w", err)
	}
	if !cfg.IsReady() {
		return nil, ErrDisabled
	}
	host := NormalizeHost(hostname)
	if host == "" {
		return nil, errors.New("litera: hostname kosong")
	}

	body, err := json.Marshal(DomainRegisterRequest{Domains: []string{host}})
	if err != nil {
		return nil, fmt.Errorf("litera: marshal domain register: %w", err)
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/cms/domains/register"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("litera: build domain request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("litera: http do: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	corrID := extractCorrelationID(respBody)

	switch resp.StatusCode {
	// 202 sejalan dengan doc "aktivasi allowlist butuh ≤60 detik" — accepted,
	// bukan gagal. Kalau ditolak jadi error, EnsureDomain memblokir register
	// artikel berikutnya padahal domain sudah masuk antrean.
	case http.StatusOK, http.StatusCreated, http.StatusAccepted:
		var out DomainRegisterResponse
		if err := json.Unmarshal(respBody, &out); err != nil {
			return nil, fmt.Errorf("litera: decode domain response: %w", err)
		}
		slog.Info("litera domain registered",
			"hostname", host, "auto_approved", out.Data.AutoApproved, "correlation", corrID)
		return &out, nil
	case http.StatusUnauthorized:
		return nil, errors.Join(ErrUnauthorized, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)})
	case http.StatusBadRequest:
		// Doc: 400 = "API key dibatasi untuk root domain tertentu".
		return nil, errors.Join(ErrDomainOutOfScope, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)})
	case http.StatusTooManyRequests:
		return nil, errors.Join(ErrRateLimit, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)})
	default:
		return nil, &APIError{StatusCode: resp.StatusCode, CorrelationID: corrID, Body: string(respBody)}
	}
}

// EnsureDomain — pastikan hostname ada di CORS allowlist sebelum register
// artikel. Hit API hanya kalau kita belum punya catatan sukses, supaya publish
// artikel berikutnya dari domain yang sama tidak boros round-trip.
func (c *Client) EnsureDomain(ctx context.Context, hostname string) error {
	host := NormalizeHost(hostname)
	if host == "" {
		return errors.New("litera: hostname kosong")
	}
	if c.domains != nil {
		rec, err := c.domains.Get(ctx, host)
		if err == nil && rec != nil && rec.Status == DomainStatusRegistered {
			return nil
		}
	}
	res, err := c.RegisterDomain(ctx, host)
	if err != nil {
		if c.domains != nil && !errors.Is(err, ErrDisabled) {
			_ = c.domains.MarkFailed(ctx, host, err.Error())
		}
		return err
	}
	if c.domains != nil {
		_ = c.domains.MarkRegistered(ctx, host, res.Data.AutoApproved)
	}
	return nil
}

// InvalidateDomain — tandai catatan allowlist sebagai basi supaya percobaan
// berikutnya mendaftarkan ulang. Dipanggil saat register artikel kena 403:
// artinya domain ternyata tidak (lagi) ada di allowlist.
func (c *Client) InvalidateDomain(ctx context.Context, hostname, reason string) {
	if c.domains == nil {
		return
	}
	_ = c.domains.Invalidate(ctx, hostname, reason)
}

// DomainRecord — expose catatan allowlist untuk admin debug panel.
func (c *Client) DomainRecord(ctx context.Context, hostname string) (*DomainRecord, error) {
	if c.domains == nil {
		return nil, nil
	}
	return c.domains.Get(ctx, hostname)
}

// ResolveStatus — representasi minimal GET /articles/resolve response untuk
// cek status mint. 404 = belum di-mint (bukan error).
type ResolveStatus struct {
	TokenID    string `json:"tokenId"`
	Generation int    `json:"generation"`
}

// Resolve — GET /articles/resolve?url=... Return (nil, nil) kalau 404 (belum
// mint, bukan error). Return (status, nil) kalau sudah mint.
func (c *Client) Resolve(ctx context.Context, articleURL string) (*ResolveStatus, error) {
	cfg, err := c.cfg.Get(ctx)
	if err != nil {
		return nil, err
	}
	if !cfg.IsReady() {
		return nil, ErrDisabled
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/articles/resolve?url=" + url.QueryEscape(articleURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case http.StatusOK:
		// Envelope { success, data: { tokenId, generation } }.
		var env struct {
			Success bool          `json:"success"`
			Data    ResolveStatus `json:"data"`
		}
		if err := json.Unmarshal(respBody, &env); err != nil {
			return nil, err
		}
		return &env.Data, nil
	case http.StatusNotFound:
		return nil, nil // belum mint — bukan error
	case http.StatusUnauthorized:
		return nil, ErrUnauthorized
	default:
		return nil, &APIError{StatusCode: resp.StatusCode, Body: string(respBody)}
	}
}

// BuildRegisterRequest — helper merge config defaults + article data jadi
// payload. Pemanggil (publish hook) tinggal isi field artikel; smart contract
// params otomatis dari config.
func (c *Client) BuildRegisterRequest(
	ctx context.Context,
	articleURL, title, author, description, coverImageURL string,
	unlockableURL, unlockableDescription string,
	quiz *QuizPayload,
) (RegisterRequest, error) {
	cfg, err := c.cfg.Get(ctx)
	if err != nil {
		return RegisterRequest{}, err
	}
	req := RegisterRequest{
		ArticleURL:            articleURL,
		Title:                 title,
		Author:                author,
		Description:           description,
		CoverImageURL:         coverImageURL,
		UnlockableURL:         unlockableURL,
		UnlockableDescription: unlockableDescription,
		// Price:                   cfg.DefaultPrice,
		// FeeEnabled:              cfg.DefaultFeeEnabled,
		// MaxMinted:               cfg.DefaultMaxMinted,
		// UserReward:              cfg.DefaultUserReward,
		// CreatorMintReward:       cfg.DefaultCreatorMintReward,
		// CreatorApproveReward:    cfg.DefaultCreatorApproveReward,
		CollectionName: cfg.CollectionName,
	}
	if quiz != nil && !quiz.IsEmpty() {
		req.Quiz = quiz
	}
	return req, nil
}

// extractCorrelationID — ambil correlationId dari respons untuk logging.
// Format envelope: { meta: { correlationId } }.
func extractCorrelationID(body []byte) string {
	var env struct {
		Meta struct {
			CorrelationID string `json:"correlationId"`
		} `json:"meta"`
	}
	_ = json.Unmarshal(body, &env)
	return env.Meta.CorrelationID
}
