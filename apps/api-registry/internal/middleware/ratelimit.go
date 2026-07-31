package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
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
