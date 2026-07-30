// Package security — HMAC authentication middleware untuk internal API.
// Konsep: web builder API sign request body + path dengan shared secret,
// api-registry verify signature sebelum handle request. Simple, no PKI,
// cocok untuk service-to-service dalam trust boundary yang sama.
//
// Header:
//   X-Signature: sha256=<hex(hmac(secret, timestamp + "." + method + path + "." + body))>
//   X-Timestamp: <unix seconds> (reject > 5 minutes drift)
//
// Kalau butuh stronger (mTLS, JWT signed dengan asymmetric key), swap
// implementation di sini — handler tidak berubah.

package security

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
)

const (
	headerSignature = "X-Signature"
	headerTimestamp = "X-Timestamp"
	maxSkew         = 5 * time.Minute
)

// HMACMiddleware — returns Fiber middleware yang enforce HMAC signature.
// Kalau `secret` kosong (dev mode), middleware skip (no auth) — cek di
// main.go log warning kalau ini terjadi di non-dev.
func HMACMiddleware(secret string) fiber.Handler {
	if secret == "" {
		return func(c *fiber.Ctx) error {
			// No auth mode — dev only.
			return c.Next()
		}
	}
	secretBytes := []byte(secret)
	return func(c *fiber.Ctx) error {
		// Skip health check + metrics (no side effect + public).
		p := c.Path()
		if p == "/healthz" || p == "/metrics" {
			return c.Next()
		}

		sigHeader := c.Get(headerSignature)
		tsHeader := c.Get(headerTimestamp)
		if sigHeader == "" || tsHeader == "" {
			return httpx.Unauthorized(c, "signature/timestamp header wajib")
		}

		// Verify timestamp fresh (cegah replay attack).
		tsInt, err := strconv.ParseInt(tsHeader, 10, 64)
		if err != nil {
			return httpx.Unauthorized(c, "timestamp invalid")
		}
		ts := time.Unix(tsInt, 0)
		if time.Since(ts).Abs() > maxSkew {
			return httpx.Unauthorized(c, "timestamp expired (max ±5 menit)")
		}

		// Parse signature: "sha256=<hex>"
		if !strings.HasPrefix(sigHeader, "sha256=") {
			return httpx.Unauthorized(c, "signature scheme harus sha256=")
		}
		sig := strings.TrimPrefix(sigHeader, "sha256=")
		sigBytes, err := hex.DecodeString(sig)
		if err != nil {
			return httpx.Unauthorized(c, "signature invalid hex")
		}

		// Compute expected: HMAC-SHA256(secret, ts + "." + method + path + "." + body)
		body := c.Body()
		var buf bytes.Buffer
		buf.WriteString(tsHeader)
		buf.WriteByte('.')
		buf.WriteString(c.Method())
		buf.WriteString(c.OriginalURL())
		buf.WriteByte('.')
		buf.Write(body)

		mac := hmac.New(sha256.New, secretBytes)
		mac.Write(buf.Bytes())
		expected := mac.Sum(nil)

		if subtle.ConstantTimeCompare(sigBytes, expected) != 1 {
			return httpx.Unauthorized(c, "signature mismatch")
		}
		return c.Next()
	}
}

// _ ensure io imported (dipakai kalau ada body streaming di future).
var _ = io.Copy
