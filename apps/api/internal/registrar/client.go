// Package registrar is a thin, typed wrapper around the internal
// api-registry EPP service (`apps/api-registry`). Semua flow domain lifecycle
// (check/register/renew/nameserver/whois) di-route lewat sini.
package registrar

import (
	"errors"
	"fmt"
	"strings"
	"time"

	apiregistry "github.com/webbuilder/api-registry/client"
)

// Config bundles the runtime knobs. APIRegistryURL wajib; kalau kosong,
// New() return nil (feature disabled).
type Config struct {
	APIRegistryURL        string        // e.g. "http://api-registry:8081"
	APIRegistryHMACSecret string        // shared dengan api-registry INTERNAL_HMAC_SECRET
	APIRegistryTimeout    time.Duration // default 30s
}

// Client is a typed handle. Semua EPP call route ke api-registry via
// SDK client (HMAC-signed, service-to-service).
type Client struct {
	apiRegistry *apiregistry.Client
}

// New returns nil kalau APIRegistryURL kosong (feature disabled). Konsumer
// wajib nil-check sebelum panggil method.
func New(cfg Config) (*Client, error) {
	if cfg.APIRegistryURL == "" {
		return nil, nil
	}
	if !strings.HasPrefix(cfg.APIRegistryURL, "http://") && !strings.HasPrefix(cfg.APIRegistryURL, "https://") {
		return nil, fmt.Errorf("registrar: APIRegistryURL must be absolute (got %q)", cfg.APIRegistryURL)
	}
	timeout := cfg.APIRegistryTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ac, err := apiregistry.New(apiregistry.Config{
		BaseURL: cfg.APIRegistryURL,
		Secret:  cfg.APIRegistryHMACSecret,
		Timeout: timeout,
	})
	if err != nil {
		return nil, fmt.Errorf("registrar: build api-registry client: %w", err)
	}
	return &Client{apiRegistry: ac}, nil
}

// UsesAPIRegistry — always true kalau Client non-nil (Phase 3+ full
// self-sufficient, legacy backend sudah dihapus). Konsumer masih pakai
// predicate ini sebagai feature-gate.
func (c *Client) UsesAPIRegistry() bool { return c != nil && c.apiRegistry != nil }

// APIError adalah error typed dari api-registry (mirror struktur legacy
// supaya konsumer domain_purchase yang pattern-match errors.As tetap kompatibel).
type APIError struct {
	Status int    // HTTP status code
	Code   string // business error code
	Msg    string // human-readable message
}

func (e *APIError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("registrar api %d [%s]: %s", e.Status, e.Code, e.Msg)
	}
	return fmt.Sprintf("registrar api %d: %s", e.Status, e.Msg)
}

// IsAPIError reports whether the error came from an HTTP response.
func IsAPIError(err error) bool {
	var e *APIError
	return errors.As(err, &e)
}
