package provider

import (
	"errors"
	"fmt"
)

// Sentinel errors — konsumer bandingkan via errors.Is untuk mapping ke HTTP
// status yang tepat. Wrap upstream error dengan %w kalau butuh detail.
var (
	ErrNotFound         = errors.New("provider: not found")
	ErrConflict         = errors.New("provider: conflict / duplicate")
	ErrValidation       = errors.New("provider: validation failed")
	ErrUpstream         = errors.New("provider: upstream error")
	ErrRateLimit        = errors.New("provider: rate limit exceeded")
	ErrUnauthorized     = errors.New("provider: unauthorized upstream")
	ErrCapabilityMissing = errors.New("provider: capability not supported")
)

// UpstreamError — detail response dari upstream (registrar-api atau EPP).
// Bisa di-unwrap ke ErrUpstream via errors.Is.
type UpstreamError struct {
	Provider string
	Status   int
	Code     string
	Message  string
	Cause    error
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("%s upstream error [%d %s]: %s", e.Provider, e.Status, e.Code, e.Message)
}

func (e *UpstreamError) Unwrap() error { return ErrUpstream }
