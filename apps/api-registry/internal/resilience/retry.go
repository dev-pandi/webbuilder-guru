package resilience

import (
	"context"
	"errors"
	"math/rand"
	"time"

	"github.com/webbuilder/api-registry/internal/provider"
)

// RetryConfig — exponential backoff dengan jitter.
type RetryConfig struct {
	// MaxAttempts — total attempt termasuk yang pertama. Default 3
	// (initial + 2 retry).
	MaxAttempts int
	// InitialDelay — sleep sebelum retry pertama. Default 200ms.
	InitialDelay time.Duration
	// MaxDelay — cap delay antar retry. Default 5s.
	MaxDelay time.Duration
	// Multiplier — factor exponential (2.0 = double tiap retry). Default 2.
	Multiplier float64
	// JitterFraction — random ±X% dari delay untuk avoid thundering herd.
	// Default 0.2 (±20%).
	JitterFraction float64
}

func (c *RetryConfig) defaults() {
	if c.MaxAttempts <= 0 {
		c.MaxAttempts = 3
	}
	if c.InitialDelay <= 0 {
		c.InitialDelay = 200 * time.Millisecond
	}
	if c.MaxDelay <= 0 {
		c.MaxDelay = 5 * time.Second
	}
	if c.Multiplier <= 1 {
		c.Multiplier = 2.0
	}
	if c.JitterFraction < 0 {
		c.JitterFraction = 0
	}
}

// IsTransient — cek apakah error worth retry. Transient: network / 5xx /
// rate limit. Deterministic client error (ErrValidation, ErrNotFound, dsb.)
// TIDAK di-retry — waste bandwidth.
func IsTransient(err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, provider.ErrRateLimit):
		return true // 429 → back off + retry
	case errors.Is(err, provider.ErrNotFound),
		errors.Is(err, provider.ErrValidation),
		errors.Is(err, provider.ErrConflict),
		errors.Is(err, provider.ErrCapabilityMissing),
		errors.Is(err, provider.ErrUnauthorized):
		return false
	case errors.Is(err, provider.ErrUpstream):
		// Wrap `UpstreamError` bisa dari network (Status=0) atau HTTP 5xx.
		var upErr *provider.UpstreamError
		if errors.As(err, &upErr) {
			// Retry network error (Status=0) + 5xx.
			return upErr.Status == 0 || upErr.Status >= 500
		}
		return true
	}
	// Unknown error → assume transient (safe default untuk resilient behavior).
	return true
}

// Retry — execute fn dengan exponential backoff. Return last error kalau
// semua attempt fail. Context cancellation dihormati (return context error
// segera). Kalau error deterministic (bukan transient), return segera.
func Retry(ctx context.Context, cfg RetryConfig, fn func() error) error {
	cfg.defaults()

	var lastErr error
	delay := cfg.InitialDelay
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		lastErr = fn()
		if lastErr == nil {
			return nil
		}
		if !IsTransient(lastErr) {
			return lastErr // fail fast — retry tidak akan help
		}
		if attempt == cfg.MaxAttempts {
			return lastErr
		}
		// Backoff + jitter sebelum retry.
		sleep := delayWithJitter(delay, cfg.JitterFraction)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(sleep):
		}
		// Exponential grow, cap ke MaxDelay.
		delay = time.Duration(float64(delay) * cfg.Multiplier)
		if delay > cfg.MaxDelay {
			delay = cfg.MaxDelay
		}
	}
	return lastErr
}

// delayWithJitter — apply ±fraction jitter. Contoh delay=1s, fraction=0.2:
// output 800ms - 1200ms random.
func delayWithJitter(d time.Duration, fraction float64) time.Duration {
	if fraction <= 0 {
		return d
	}
	// #nosec G404 — jitter tidak butuh crypto random.
	jitter := (rand.Float64()*2 - 1) * fraction // ±fraction
	return time.Duration(float64(d) * (1 + jitter))
}
