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
	cfg  *ConfigRepo
	http *http.Client
}

// NewClient — wire. HTTP client dengan 30s timeout per request (sesuai doc
// "60 req/menit" rate limit, tidak perlu long poll).
func NewClient(cfg *ConfigRepo) *Client {
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: 30 * time.Second},
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
	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated:
		var out RegisterResponse
		if err := json.Unmarshal(respBody, &out); err != nil {
			return nil, fmt.Errorf("litera: decode response: %w", err)
		}
		slog.Info("litera register success",
			"intent_id", out.Data.Intent.ID, "correlation", corrID)
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
		ArticleURL:              articleURL,
		Title:                   title,
		Author:                  author,
		Description:             description,
		CoverImageURL:           coverImageURL,
		UnlockableURL:           unlockableURL,
		UnlockableDescription:   unlockableDescription,
		Price:                   cfg.DefaultPrice,
		FeeEnabled:              cfg.DefaultFeeEnabled,
		MaxMinted:               cfg.DefaultMaxMinted,
		UserReward:              cfg.DefaultUserReward,
		CreatorMintReward:       cfg.DefaultCreatorMintReward,
		CreatorApproveReward:    cfg.DefaultCreatorApproveReward,
		CollectionName:          cfg.CollectionName,
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
