// Package epp — EPP direct client wrapper untuk PANDI registry via
// al0fayz/epp-pandi-client. Fungsi utama:
//
//   1. Connection management — connect + login + auto-reconnect kalau session
//      hilang. Session pool untuk reuse conn antar-request (EPP login mahal).
//   2. Frame builder helpers — mapping dari provider DTO ke frames.XxxType.
//   3. Response parsing — unmarshal + convert ke provider types + map EPP
//      error code ke sentinel error.
//
// Consumer utama: EPPDirectProvider di sibling file. Package tetap standalone
// supaya bisa dipakai standalone test tanpa import provider.
package epp

import (
	"context"
	"crypto/tls"
	"encoding/xml"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/al0fayz/epp-pandi-client/epp"
	"github.com/al0fayz/epp-pandi-client/frames"
)

// Config — dependency injection untuk EPPDirect connection.
type Config struct {
	Host     string        // "epp1.pandi.id"
	Port     int           // 700 (OT&E: 3121 kadang)
	Username string
	Password string
	// TLS auth options — pilih salah satu:
	CertFile string // path client cert (PEM)
	KeyFile  string // path client private key (PEM)
	CAFile   string // path CA cert untuk verify server (opsional)

	InsecureSkipVerify bool          // dev/OT&E dengan self-signed
	Timeout            time.Duration // per-command timeout (default 30s)
	KeepAliveInterval  time.Duration // hello frame interval (default 5min)
	MaxRetries         int           // per-command retry (default 2)
}

// Client — session-aware EPP wrapper. Thread-safe: single underlying conn
// + mutex around commands (EPP protocol serial — 1 command per session).
//
// Untuk high-concurrency, gunakan SessionPool (dibungkus di connection
// package terpisah). MVP: single session cukup untuk <10 req/sec.
type Client struct {
	cfg     Config
	client  *epp.Client
	connMu  sync.Mutex // serialize commands (EPP not concurrent)
	loggedIn bool
}

// New — construct client. Belum connect — call Connect() explicitly saat
// startup atau lazy on-first-use.
func New(cfg Config) (*Client, error) {
	if cfg.Host == "" || cfg.Username == "" || cfg.Password == "" {
		return nil, fmt.Errorf("epp: Host + Username + Password wajib")
	}
	if cfg.Port == 0 {
		cfg.Port = 700
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.KeepAliveInterval == 0 {
		cfg.KeepAliveInterval = 5 * time.Minute
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 2
	}
	return &Client{cfg: cfg}, nil
}

// Connect — establish TCP+TLS + EPP login. Idempotent: kalau sudah connected
// dan logged in, no-op.
func (c *Client) Connect(ctx context.Context) error {
	c.connMu.Lock()
	defer c.connMu.Unlock()
	if c.loggedIn && c.client != nil && c.client.IsConnected() {
		return nil
	}
	return c.connectLocked(ctx)
}

// connectLocked — assumes lock held.
func (c *Client) connectLocked(ctx context.Context) error {
	// Build TLS config berdasarkan opsi credentials.
	// TLS 1.2 minimum — PANDI EPP sandbox biasanya belum support 1.3.
	// Naikkan ke 1.3 kalau operator konfirmasi registry mendukung.
	tlsCfg := &tls.Config{
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: c.cfg.InsecureSkipVerify, // #nosec G402 — opt-in per config
	}
	if c.cfg.CertFile != "" && c.cfg.KeyFile != "" {
		cert, err := tls.LoadX509KeyPair(c.cfg.CertFile, c.cfg.KeyFile)
		if err != nil {
			return fmt.Errorf("epp: load client cert: %w", err)
		}
		tlsCfg.Certificates = []tls.Certificate{cert}
	}

	opts := []epp.ClientOption{
		epp.WithTLSConfig(tlsCfg),
		epp.WithTransactionID("api-registry"),
		epp.WithRetry(c.cfg.MaxRetries, 500*time.Millisecond),
	}
	if c.cfg.InsecureSkipVerify {
		opts = append(opts, epp.WithInsecureSkipVerify(true))
	}

	client, err := epp.NewClient(opts...)
	if err != nil {
		return fmt.Errorf("epp: new client: %w", err)
	}

	addr := net.JoinHostPort(c.cfg.Host, fmt.Sprint(c.cfg.Port))
	if _, err := client.Connect(addr); err != nil {
		return fmt.Errorf("epp: connect %s: %w", addr, err)
	}
	if _, err := client.Login(ctx, c.cfg.Username, c.cfg.Password); err != nil {
		_ = client.Close()
		return fmt.Errorf("epp: login: %w", err)
	}
	c.client = client
	c.loggedIn = true
	return nil
}

// ensureConnected — connect+login kalau session belum ada. Dipanggil sebelum
// setiap command supaya self-heal saat conn drop.
func (c *Client) ensureConnected(ctx context.Context) error {
	if c.client != nil && c.client.IsConnected() && c.loggedIn {
		return nil
	}
	if c.client != nil {
		_ = c.client.Close()
	}
	c.loggedIn = false
	return c.connectLocked(ctx)
}

// Close — logout + close TCP. Idempotent.
func (c *Client) Close() error {
	c.connMu.Lock()
	defer c.connMu.Unlock()
	if c.client == nil {
		return nil
	}
	if c.loggedIn {
		// Best-effort logout — timeout kalau conn stuck.
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = c.client.Logout(ctx)
	}
	err := c.client.Close()
	c.client = nil
	c.loggedIn = false
	return err
}

// Ping — kirim EPP hello frame untuk cek liveness. Dipakai /readyz probe.
func (c *Client) Ping(ctx context.Context) error {
	c.connMu.Lock()
	defer c.connMu.Unlock()
	if err := c.ensureConnected(ctx); err != nil {
		return err
	}
	_, err := c.client.Hello(ctx)
	return err
}

// parseResponse — helper: parse raw XML ke Response envelope + return error
// kalau EPP result code >= 2000. `resultData`/`extension` bisa nil kalau
// caller tidak butuh typed data.
func parseResponse(raw []byte, op string, resultData, extension any) (*frames.Response, error) {
	resp := &frames.Response{
		ResultData: resultData,
		Extension:  extension,
	}
	if err := xml.Unmarshal(raw, resp); err != nil {
		return nil, fmt.Errorf("epp: unmarshal response (%s): %w", op, err)
	}
	if len(resp.Result) == 0 {
		return resp, fmt.Errorf("epp: response missing <result> (%s)", op)
	}
	r := resp.Result[0]
	if r.Code >= 2000 {
		return resp, &EPPResponseError{Code: r.Code, Message: r.Message, Op: op}
	}
	return resp, nil
}
