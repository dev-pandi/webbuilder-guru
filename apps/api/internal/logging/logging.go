// Package logging configures the process-wide structured logger.
//
// We use stdlib log/slog (Go 1.21+) — no extra dependency. In production we
// emit JSON for log aggregators; in development we emit human-readable text
// with source line info.
package logging

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

// Setup installs a slog default logger appropriate for the given environment.
// Returns the logger so callers can pass it around explicitly when context is
// useful (e.g., scoped child loggers).
func Setup(appEnv, level string) *slog.Logger {
	var h slog.Handler
	opts := &slog.HandlerOptions{
		Level: parseLevel(level),
	}
	if appEnv == "production" {
		h = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		// Dev: text handler with source location, easier to scan.
		opts.AddSource = true
		h = slog.NewTextHandler(os.Stdout, opts)
	}
	lg := slog.New(h)
	slog.SetDefault(lg)
	return lg
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Discard returns a logger that drops everything. Useful in tests.
func Discard() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError + 1}))
}
