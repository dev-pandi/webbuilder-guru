package router

import (
	"log/slog"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/requestid"

	"github.com/webbuilder/api/internal/metrics"
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

// SlogLogger emits one structured log line per request and feeds the metrics
// registry (request count + latency histogram per method/route/status family).
//
// Fields kept narrow so log volume stays manageable.
func SlogLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		rid, _ := c.Locals("requestid").(string)
		status := c.Response().StatusCode()
		method := c.Method()
		// Use the route template ("/sites/:id") rather than the materialised path
		// ("/sites/abc-123") so cardinality stays bounded.
		route := c.Route().Path
		if route == "" {
			route = c.Path()
		}

		metrics.Default.CounterInc("http_requests_total",
			"HTTP requests received",
			map[string]string{
				"method": method,
				"route":  route,
				"status": strconv.Itoa(status),
			})
		metrics.Default.HistogramObserve("http_request_duration_seconds",
			"HTTP request latency in seconds",
			map[string]string{
				"method": method,
				"route":  route,
			}, latency.Seconds())

		attrs := []any{
			slog.String("method", method),
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
