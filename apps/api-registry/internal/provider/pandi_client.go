// PandiWrapperProvider — MVP implementation Provider yang delegate ke
// registrar-api PANDI existing (HTTP proxy). Fase 2 nanti swap dengan
// EPPDirectProvider yang bicara EPP TCP+TLS ke PANDI OT&E / production.
//
// Rationale: Fase 1 fokus decoupling arsitektur — web builder cuma tahu
// api-registry, tidak tahu backend-nya. Nanti swap ke EPP direct tanpa
// touch web builder.

package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type PandiWrapperProvider struct {
	baseURL string
	httpc   *http.Client

	// Static token OR auto-refresh via email/password. Kalau keduanya di-set,
	// email/password menang (auto refresh 25 hari sekali).
	staticToken string
	email       string
	password    string

	mu           sync.RWMutex
	activeToken  string
	tokenExpires time.Time
	reauthMu     sync.Mutex // serialize re-auth kalau 401 race
}

// PandiWrapperConfig — dependency injection dari main.go.
type PandiWrapperConfig struct {
	BaseURL     string
	StaticToken string        // JWT statis (opsional kalau pakai email/pass)
	Email       string        // untuk auto-login + refresh 25-hari
	Password    string
	Timeout     time.Duration
}

func NewPandiWrapper(cfg PandiWrapperConfig) (*PandiWrapperProvider, error) {
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("BaseURL wajib")
	}
	if cfg.StaticToken == "" && (cfg.Email == "" || cfg.Password == "") {
		return nil, fmt.Errorf("staticToken atau (email + password) wajib")
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 15 * time.Second
	}
	p := &PandiWrapperProvider{
		baseURL:     strings.TrimRight(cfg.BaseURL, "/"),
		httpc:       &http.Client{Timeout: cfg.Timeout},
		staticToken: cfg.StaticToken,
		email:       cfg.Email,
		password:    cfg.Password,
	}
	if cfg.StaticToken != "" {
		p.activeToken = cfg.StaticToken
	}
	return p, nil
}

func (p *PandiWrapperProvider) Name() string { return "pandi_wrapper" }

func (p *PandiWrapperProvider) Capabilities() Capabilities {
	return Capabilities{
		HasBulkCheck: true,
		HasContact:   true,
	}
}

// --- HTTP transport helpers ---

// envelope — shape response registrar-api: `{ "data": ... }` atau
// `{ "code": ..., "errors": ..., "messages": ... }` untuk error legacy.
type envelope[T any] struct {
	Data     T      `json:"data"`
	Code     int    `json:"code,omitempty"`
	Errors   any    `json:"errors,omitempty"`
	Messages string `json:"messages,omitempty"`
}

// do — generic HTTP with auto-reauth on 401 (kalau email/password di-set).
func (p *PandiWrapperProvider) do(ctx context.Context, method, path string, body any, out any) error {
	buf, err := p.marshal(body)
	if err != nil {
		return err
	}
	url := p.baseURL + path

	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.currentToken())

	resp, err := p.httpc.Do(req)
	if err != nil {
		return &UpstreamError{Provider: p.Name(), Status: 0, Code: "network", Message: err.Error(), Cause: err}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// 401 → coba reauth sekali (kalau email/pass mode), retry.
	if resp.StatusCode == http.StatusUnauthorized && p.email != "" {
		if reauthErr := p.reauth(ctx); reauthErr == nil {
			return p.do(ctx, method, path, body, out)
		}
	}

	if resp.StatusCode >= 400 {
		return p.decodeError(resp.StatusCode, respBody)
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return &UpstreamError{Provider: p.Name(), Status: resp.StatusCode, Code: "decode", Message: err.Error(), Cause: err}
	}
	return nil
}

func (p *PandiWrapperProvider) marshal(body any) ([]byte, error) {
	if body == nil {
		return nil, nil
	}
	return json.Marshal(body)
}

func (p *PandiWrapperProvider) currentToken() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.activeToken
}

// reauth — serialized via reauthMu. Kalau 2 goroutine trigger reauth
// bareng, cuma 1 yang eksekusi login.
func (p *PandiWrapperProvider) reauth(ctx context.Context) error {
	p.reauthMu.Lock()
	defer p.reauthMu.Unlock()

	// Double-check: token bisa jadi udah di-refresh goroutine sebelumnya.
	if time.Now().Before(p.tokenExpires) {
		return nil
	}

	loginBody := map[string]string{
		"email":    p.email,
		"password": p.password,
	}
	buf, _ := json.Marshal(loginBody)
	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/v1/api/user/login", bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("reauth failed status=%d", resp.StatusCode)
	}
	var out struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return err
	}
	if out.Data.Token == "" {
		return fmt.Errorf("reauth response tidak berisi token")
	}
	p.mu.Lock()
	p.activeToken = out.Data.Token
	p.tokenExpires = time.Now().Add(25 * 24 * time.Hour) // JWT registrar TTL 30 hari, refresh 5 hari sebelum expire
	p.mu.Unlock()
	return nil
}

// decodeError — parse response error dari registrar-api format.
func (p *PandiWrapperProvider) decodeError(status int, body []byte) error {
	// Registrar-api legacy shape: { code, errors, messages }
	// atau modern: { error: { code, message } }
	var legacy struct {
		Code     int    `json:"code"`
		Errors   any    `json:"errors"`
		Messages string `json:"messages"`
	}
	_ = json.Unmarshal(body, &legacy)

	var modern struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &modern)

	msg := modern.Error.Message
	if msg == "" {
		msg = legacy.Messages
	}
	code := modern.Error.Code
	if code == "" {
		code = strconv.Itoa(status)
	}

	// Map ke sentinel error.
	uerr := &UpstreamError{
		Provider: p.Name(),
		Status:   status,
		Code:     code,
		Message:  msg,
	}
	switch status {
	case http.StatusNotFound:
		return fmt.Errorf("%w: %s", ErrNotFound, uerr.Error())
	case http.StatusConflict:
		return fmt.Errorf("%w: %s", ErrConflict, uerr.Error())
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return fmt.Errorf("%w: %s", ErrValidation, uerr.Error())
	case http.StatusTooManyRequests:
		return fmt.Errorf("%w: %s", ErrRateLimit, uerr.Error())
	case http.StatusUnauthorized:
		return fmt.Errorf("%w: %s", ErrUnauthorized, uerr.Error())
	}
	return uerr
}

// helper untuk build query string.
func queryString(kv map[string]string) string {
	q := url.Values{}
	for k, v := range kv {
		if v != "" {
			q.Set(k, v)
		}
	}
	if enc := q.Encode(); enc != "" {
		return "?" + enc
	}
	return ""
}
