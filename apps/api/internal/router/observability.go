package router

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

// RequestID mounts the Fiber request-id middleware, generating one if the
// client didn't send X-Request-ID. The value is later read by SlogLogger so
// every log line for a request can be correlated.
func RequestID() fiber.Handler {
	return requestid.New(requestid.Config{
		Header: "X-Request-ID",
		ContextKey: "requestid",
	})
}

// SlogLogger emits one structured log line per request.
//
// We don't try to replicate Fiber's coloured access log — production wants
// machine-readable JSON, dev wants something grep-friendly. Fields kept narrow
// so log volume stays manageable.
func SlogLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		rid, _ := c.Locals("requestid").(string)
		status := c.Response().StatusCode()

		attrs := []any{
			slog.String("method", c.Method()),
			slog.String("path", c.Path()),
			slog.Int("status", status),
			slog.Duration("latency", latency),
			slog.String("ip", c.IP()),
		}
		if rid != "" {
			attrs = append(attrs, slog.String("request_id", rid))
		}
		if err != nil {
			attrs = append(attrs, slog.String("error", err.Error()))
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
