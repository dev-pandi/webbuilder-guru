package resilience

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/webbuilder/api-registry/internal/provider"
)

func TestIsTransient_Classification(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"validation deterministic", fmt.Errorf("%w: bad", provider.ErrValidation), false},
		{"not found deterministic", provider.ErrNotFound, false},
		{"conflict deterministic", provider.ErrConflict, false},
		{"capability missing deterministic", provider.ErrCapabilityMissing, false},
		{"unauthorized deterministic", provider.ErrUnauthorized, false},
		{"rate limit transient", provider.ErrRateLimit, true},
		{"upstream network transient", &provider.UpstreamError{Status: 0, Code: "network"}, true},
		{"upstream 500 transient", &provider.UpstreamError{Status: 500}, true},
		{"upstream 400 not transient", &provider.UpstreamError{Status: 400}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsTransient(tc.err); got != tc.want {
				t.Errorf("IsTransient(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestRetry_SucceedsAfterTransientRetries(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), RetryConfig{
		MaxAttempts:  3,
		InitialDelay: 1 * time.Millisecond,
	}, func() error {
		calls++
		if calls < 3 {
			return provider.ErrRateLimit
		}
		return nil
	})
	if err != nil {
		t.Errorf("expected success, got %v", err)
	}
	if calls != 3 {
		t.Errorf("expected 3 calls, got %d", calls)
	}
}

func TestRetry_FailFastOnDeterministicError(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), RetryConfig{MaxAttempts: 5, InitialDelay: 1 * time.Millisecond},
		func() error {
			calls++
			return provider.ErrValidation
		})
	if !errors.Is(err, provider.ErrValidation) {
		t.Errorf("expected validation error, got %v", err)
	}
	if calls != 1 {
		t.Errorf("deterministic error should NOT retry, got %d calls", calls)
	}
}

func TestRetry_ExhaustedReturnsLastError(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), RetryConfig{MaxAttempts: 2, InitialDelay: 1 * time.Millisecond},
		func() error {
			calls++
			return provider.ErrRateLimit
		})
	if err != provider.ErrRateLimit {
		t.Errorf("expected last error, got %v", err)
	}
	if calls != 2 {
		t.Errorf("expected 2 attempts, got %d", calls)
	}
}

func TestRetry_ContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	err := Retry(ctx, RetryConfig{MaxAttempts: 10, InitialDelay: 50 * time.Millisecond},
		func() error {
			calls++
			if calls == 2 {
				cancel() // cancel mid-backoff
			}
			return provider.ErrRateLimit
		})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled, got %v", err)
	}
	if calls > 3 {
		t.Errorf("cancel should halt loop, got %d calls", calls)
	}
}
