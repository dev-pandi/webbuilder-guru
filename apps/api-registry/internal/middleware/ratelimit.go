package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/webbuilder/api-registry/internal/httpx"
)

// Concurrency — simple semaphore untuk cap inflight request. Registry EPP
// biasanya limit concurrent session (PANDI ~10), jadi kita cap di sini
// supaya tidak overflow upstream.
//
// Kalau semaphore penuh, request nunggu sampai timeout — return 429 kalau
// tidak dapet slot dalam window.
type semaphore struct {
	slots chan struct{}
}

func newSemaphore(n int) *semaphore {
	if n <= 0 {
		n = 20
	}
	return &semaphore{slots: make(chan struct{}, n)}
}

// Concurrency — bounded inflight middleware. Timeout default 10 detik.
// Skip untuk healthz/readyz/metrics/jobs GET (no upstream call).
func Concurrency(maxInflight int, waitTimeout time.Duration) fiber.Handler {
	if waitTimeout <= 0 {
		waitTimeout = 10 * time.Second
	}
	sem := newSemaphore(maxInflight)
	return func(c *fiber.Ctx) error {
		// Skip endpoints yang tidak hit upstream registrar.
		p := c.Path()
		if isCheapPath(p) {
			return c.Next()
		}

		select {
		case sem.slots <- struct{}{}:
			defer func() { <-sem.slots }()
			return c.Next()
		case <-time.After(waitTimeout):
			return httpx.Err(c, fiber.StatusTooManyRequests, "rate_limited",
				"semua slot upstream ke registry lagi penuh, coba lagi dalam beberapa detik")
		}
	}
}

// isCheapPath — endpoint yang tidak hit provider (no EPP call). Skip
// concurrency guard supaya health check tetap responsive walau EPP jenuh.
func isCheapPath(p string) bool {
	switch p {
	case "/healthz", "/readyz", "/metrics", "/version":
		return true
	}
	// jobs GET juga cheap (read-only in-memory).
	if len(p) >= 8 && p[:8] == "/v1/jobs" {
		return true
	}
	return false
}

// RateLimitPerIP — per-source IP throttle sebagai defense-in-depth di atas
// HMAC auth. Kalau HMAC secret bocor / accidental exposure, per-IP cap
// masih drop bulk request dari 1 source. Kalau di belakang trusted proxy
// (Caddy/nginx), pakai X-Forwarded-For first hop.
//
// Skip healthz/readyz/metrics/version — infra probing, harus responsive.
func RateLimitPerIP(max int, window time.Duration) fiber.Handler {
	if max <= 0 {
		max = 300
	}
	if window <= 0 {
		window = 60 * time.Second
	}
	return limiter.New(limiter.Config{
		Max:        max,
		Expiration: window,
		Next: func(c *fiber.Ctx) bool {
			// Skip infra endpoints supaya health check tetap responsive
			// dan monitoring tidak throttled sendirinya.
			return isCheapPath(c.Path())
		},
		KeyGenerator: func(c *fiber.Ctx) string {
			// Trusted proxy header first, fallback ke direct IP.
			if xff := c.Get("X-Forwarded-For"); xff != "" {
				return "ip:" + firstIP(xff)
			}
			return "ip:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return httpx.Err(c, fiber.StatusTooManyRequests, "rate_limited",
				"terlalu banyak request dari source ini")
		},
	})
}

// firstIP — parse first hop dari "client, proxy1, proxy2" X-Forwarded-For.
func firstIP(xff string) string {
	for i := 0; i < len(xff); i++ {
		if xff[i] == ',' {
			return xff[:i]
		}
	}
	return xff
}
