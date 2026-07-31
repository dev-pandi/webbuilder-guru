// Package middleware — request-scoped middleware yang di-share antar route:
// request ID correlation, access log terstruktur, rate limit.
package middleware

import (
	"log/slog"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api-registry/internal/metrics"
)

// HeaderRequestID — X-Request-ID header. Kalau client (web builder) kirim,
// pakai sebagai-nya (untuk cross-service tracing). Kalau tidak, generate baru
// di sini + set di response header supaya client bisa correlate.
const HeaderRequestID = "X-Request-ID"

// LocalsKeyRequestID — key untuk fetch request_id dari Fiber locals di
// handler downstream (via c.Locals(...)).
const LocalsKeyRequestID = "request_id"

// RequestID — assign request ID ke setiap request. Reuse dari header kalau
// ada + valid, else generate UUID baru.
func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		rid := c.Get(HeaderRequestID)
		if rid == "" || !looksLikeUUID(rid) {
			rid = uuid.NewString()
		}
		c.Locals(LocalsKeyRequestID, rid)
		c.Set(HeaderRequestID, rid)
		return c.Next()
	}
}

// AccessLog — log setiap request + record metrics counter. Level info
// default; error kalau status >= 500. Skip log-noise untuk endpoint infra
// (healthz/readyz/metrics) kecuali error.
func AccessLog() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		dur := time.Since(start)
		status := c.Response().StatusCode()
		path := c.Path()
		method := c.Method()

		// Metric — bucket status (100/200/300/400/500) supaya cardinality
		// tetap kecil. Path pakai route pattern kalau bisa, else raw.
		routePath := c.Route().Path
		if routePath == "" {
			routePath = path
		}
		metrics.Default.CounterInc(
			"api_registry_requests_total",
			"Total HTTP requests handled by api-registry",
			map[string]string{
				"method":   method,
				"path":     routePath,
				"status":   strconv.Itoa(status),
			},
		)
		metrics.Default.CounterAdd(
			"api_registry_request_duration_ms_sum",
			"Sum of HTTP request durations in ms (average = sum / count)",
			map[string]string{"path": routePath},
			dur.Milliseconds(),
		)

		attrs := []any{
			"method", method,
			"path", path,
			"status", status,
			"duration_ms", dur.Milliseconds(),
			"request_id", c.Locals(LocalsKeyRequestID),
			"remote", c.IP(),
		}
		// Skip health/metrics dari info log — spammy. Cuma log kalau error.
		if path == "/healthz" || path == "/readyz" || path == "/metrics" {
			if status < 400 {
				return err
			}
		}
		switch {
		case status >= 500:
			slog.Error("http", attrs...)
		case status >= 400:
			slog.Warn("http", attrs...)
		default:
			slog.Info("http", attrs...)
		}
		return err
	}
}

// looksLikeUUID — cek shape sederhana (36 char, 4 dash). Cegah header
// arbitrary di-echo — kalau client kirim junk, kita generate baru.
func looksLikeUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	dash := 0
	for _, r := range s {
		if r == '-' {
			dash++
		}
	}
	return dash == 4
}
