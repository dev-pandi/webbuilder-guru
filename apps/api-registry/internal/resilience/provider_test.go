package resilience

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/webbuilder/api-registry/internal/provider"
)

func TestProvider_Disabled_PassesThrough(t *testing.T) {
	inner := provider.NewFake()
	var calls atomic.Int32
	inner.CheckFn = func(ctx context.Context, req provider.CheckRequest) (*provider.CheckResponse, error) {
		calls.Add(1)
		return nil, provider.ErrRateLimit
	}
	p := NewProvider(inner, Config{Enabled: false})
	_, err := p.CheckDomain(context.Background(), provider.CheckRequest{Domain: "x"})
	if err != provider.ErrRateLimit {
		t.Errorf("expected pass-through error, got %v", err)
	}
	if calls.Load() != 1 {
		t.Errorf("disabled = no retry, got %d calls", calls.Load())
	}
}

func TestProvider_RetriesOnTransient(t *testing.T) {
	inner := provider.NewFake()
	var calls atomic.Int32
	inner.CheckFn = func(ctx context.Context, req provider.CheckRequest) (*provider.CheckResponse, error) {
		if calls.Add(1) < 3 {
			return nil, provider.ErrRateLimit
		}
		return &provider.CheckResponse{Query: "x"}, nil
	}
	p := NewProvider(inner, Config{
		Enabled: true,
		Retry:   RetryConfig{MaxAttempts: 5, InitialDelay: 1 * time.Millisecond},
	})
	res, err := p.CheckDomain(context.Background(), provider.CheckRequest{Domain: "x"})
	if err != nil {
		t.Fatalf("expected success after retry, got %v", err)
	}
	if res.Query != "x" {
		t.Errorf("result mismatch: %+v", res)
	}
	if calls.Load() != 3 {
		t.Errorf("expected 3 attempts, got %d", calls.Load())
	}
}

func TestProvider_CircuitOpensAfterFailures(t *testing.T) {
	inner := provider.NewFake()
	inner.CheckFn = func(ctx context.Context, req provider.CheckRequest) (*provider.CheckResponse, error) {
		return nil, provider.ErrRateLimit // always transient fail
	}
	p := NewProvider(inner, Config{
		Enabled: true,
		Retry:   RetryConfig{MaxAttempts: 1, InitialDelay: 1 * time.Millisecond}, // no retry
		Breaker: BreakerConfig{FailureThreshold: 2, CooldownPeriod: time.Second},
	})
	ctx := context.Background()
	// 2 failures → circuit opens.
	p.CheckDomain(ctx, provider.CheckRequest{Domain: "a"})
	p.CheckDomain(ctx, provider.CheckRequest{Domain: "b"})
	// 3rd call → circuit open, fast-fail.
	_, err := p.CheckDomain(ctx, provider.CheckRequest{Domain: "c"})
	if err == nil {
		t.Fatal("expected error from open circuit")
	}
	if !strings.Contains(err.Error(), "circuit breaker open") {
		t.Errorf("expected circuit open error, got %v", err)
	}
	if !errors.Is(err, ErrCircuitOpen) {
		t.Errorf("errors.Is(ErrCircuitOpen) should match")
	}
}

func TestProvider_DeterministicErrorDoesNotOpenCircuit(t *testing.T) {
	inner := provider.NewFake()
	inner.CheckFn = func(ctx context.Context, req provider.CheckRequest) (*provider.CheckResponse, error) {
		return nil, provider.ErrValidation
	}
	p := NewProvider(inner, Config{
		Enabled: true,
		Retry:   RetryConfig{MaxAttempts: 1, InitialDelay: 1 * time.Millisecond},
		Breaker: BreakerConfig{FailureThreshold: 2, CooldownPeriod: time.Second},
	})
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		p.CheckDomain(ctx, provider.CheckRequest{Domain: "x"})
	}
	// Circuit harus tetap closed — validation error deterministic.
	_, err := p.CheckDomain(ctx, provider.CheckRequest{Domain: "x"})
	if errors.Is(err, ErrCircuitOpen) {
		t.Errorf("circuit should NOT open on deterministic validation errors")
	}
}
