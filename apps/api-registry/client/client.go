// Package client — Go SDK untuk consume api-registry HTTP API. Dipakai
// oleh web builder API (dan future consumer lain) supaya:
//   - Signing HMAC di-handle di 1 tempat (tidak duplikasi tiap caller)
//   - Type-safe request/response (mirror provider.Provider interface)
//   - Retry + timeout policy konsisten
//
// Consumer pattern:
//
//   c, _ := client.New(client.Config{
//       BaseURL: "http://api-registry:5000",
//       Secret:  os.Getenv("API_REGISTRY_HMAC_SECRET"),
//   })
//   res, err := c.CheckDomain(ctx, client.CheckRequest{Domain: "myshop"})
//
// Consumer WAJIB simpan `Secret` di env (tidak hardcode) — sama shared
// dengan api-registry `INTERNAL_HMAC_SECRET`.
package client

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Config — dep injection dari main.go consumer.
type Config struct {
	BaseURL string        // "http://api-registry:5000"
	Secret  string        // HMAC shared secret (kosong = no auth, dev only)
	Timeout time.Duration // default 30s
}

// Client — HTTP client dengan HMAC signing.
type Client struct {
	base    string
	secret  []byte
	httpc   *http.Client
}

// New builds a Client. Return error kalau BaseURL kosong.
func New(cfg Config) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, errors.New("BaseURL wajib")
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	return &Client{
		base:   strings.TrimRight(cfg.BaseURL, "/"),
		secret: []byte(cfg.Secret),
		httpc:  &http.Client{Timeout: cfg.Timeout},
	}, nil
}

// APIError — response error api-registry (mengikuti envelope { error: {code, message} }).
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("api-registry error [%d %s]: %s", e.Status, e.Code, e.Message)
}

// do — internal helper HTTP: sign + call + parse envelope.
func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reqBody []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = b
	}

	// PATH untuk signing = path lengkap dengan query string (originalURL). Kita
	// pass method-path-body ke signer sesuai spec middleware server.
	fullURL := c.base + path
	req, err := http.NewRequestWithContext(ctx, method, fullURL, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	// Kalau ada secret, sign.
	if len(c.secret) > 0 {
		ts := strconv.FormatInt(time.Now().Unix(), 10)
		sig := computeSignature(c.secret, ts, method, path, reqBody)
		req.Header.Set("X-Timestamp", ts)
		req.Header.Set("X-Signature", "sha256="+sig)
	}

	resp, err := c.httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		// Parse envelope error.
		var env struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(respBody, &env)
		msg := env.Error.Message
		if msg == "" {
			msg = string(respBody)
		}
		code := env.Error.Code
		if code == "" {
			code = strconv.Itoa(resp.StatusCode)
		}
		return &APIError{Status: resp.StatusCode, Code: code, Message: msg}
	}

	if out == nil {
		return nil
	}
	// Parse `{ data: ... }`.
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(respBody, &env); err != nil {
		return fmt.Errorf("decode envelope: %w", err)
	}
	if err := json.Unmarshal(env.Data, out); err != nil {
		return fmt.Errorf("decode data: %w", err)
	}
	return nil
}

// computeSignature — sha256 HMAC exactly seperti server middleware.
// Format: hmac_sha256(secret, ts + "." + METHOD + PATH + "." + BODY)
func computeSignature(secret []byte, ts, method, path string, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts))
	mac.Write([]byte{'.'})
	mac.Write([]byte(method))
	mac.Write([]byte(path))
	mac.Write([]byte{'.'})
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// --- helper untuk build path dengan query ---

func withQuery(path string, kv map[string]string) string {
	if len(kv) == 0 {
		return path
	}
	q := url.Values{}
	for k, v := range kv {
		if v != "" {
			q.Set(k, v)
		}
	}
	if enc := q.Encode(); enc != "" {
		return path + "?" + enc
	}
	return path
}
