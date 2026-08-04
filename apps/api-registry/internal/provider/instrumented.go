package provider

import (
	"context"
	"errors"
	"time"

	"github.com/webbuilder/api-registry/internal/metrics"
)

// Instrumented — decorator yang record metrics per operation. Wrap Provider
// concrete apapun (Pandi wrapper, EPP direct nanti) tanpa modifikasi impl.
//
// Metrics yang direcord:
//
//   api_registry_provider_calls_total{provider, operation, result}  counter
//   api_registry_provider_call_duration_ms_sum{provider, operation} counter (histogram-ish sum)
//
// Result label: "success" | "upstream_error" | "not_found" | "validation" |
// "rate_limit" | "conflict" | "capability_missing".
type Instrumented struct {
	inner Provider
}

func NewInstrumented(inner Provider) *Instrumented {
	return &Instrumented{inner: inner}
}

func (p *Instrumented) Name() string             { return p.inner.Name() }
func (p *Instrumented) Capabilities() Capabilities { return p.inner.Capabilities() }

// Shutdown — forward ke inner provider kalau dia implement Shutdown().
// Instrumented wrapper transparent — resource cleanup dilakukan inner.
func (p *Instrumented) Shutdown() error {
	if s, ok := p.inner.(interface{ Shutdown() error }); ok {
		return s.Shutdown()
	}
	return nil
}

// record — helper: bump counter + duration.
func (p *Instrumented) record(op string, start time.Time, err error) {
	result := classifyErr(err)
	metrics.Default.CounterInc(
		"api_registry_provider_calls_total",
		"Total provider (upstream) calls per operation + result",
		map[string]string{
			"provider":  p.Name(),
			"operation": op,
			"result":    result,
		},
	)
	metrics.Default.CounterAdd(
		"api_registry_provider_call_duration_ms_sum",
		"Sum of provider call durations in ms",
		map[string]string{
			"provider":  p.Name(),
			"operation": op,
		},
		time.Since(start).Milliseconds(),
	)
}

func classifyErr(err error) string {
	switch {
	case err == nil:
		return "success"
	case errors.Is(err, ErrNotFound):
		return "not_found"
	case errors.Is(err, ErrValidation):
		return "validation"
	case errors.Is(err, ErrConflict):
		return "conflict"
	case errors.Is(err, ErrRateLimit):
		return "rate_limit"
	case errors.Is(err, ErrUnauthorized):
		return "upstream_auth"
	case errors.Is(err, ErrCapabilityMissing):
		return "capability_missing"
	default:
		return "upstream_error"
	}
}

// --- Provider method delegations, each wrapped with record() ---

func (p *Instrumented) CheckDomain(ctx context.Context, req CheckRequest) (*CheckResponse, error) {
	start := time.Now()
	r, err := p.inner.CheckDomain(ctx, req)
	p.record("check_domain", start, err)
	return r, err
}

func (p *Instrumented) BulkCheckDomains(ctx context.Context, req BulkCheckRequest) (*BulkCheckResponse, error) {
	start := time.Now()
	r, err := p.inner.BulkCheckDomains(ctx, req)
	p.record("bulk_check_domains", start, err)
	return r, err
}

func (p *Instrumented) ListDomains(ctx context.Context, f ListDomainsFilter) (*DomainListResponse, error) {
	start := time.Now()
	r, err := p.inner.ListDomains(ctx, f)
	p.record("list_domains", start, err)
	return r, err
}

func (p *Instrumented) RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	start := time.Now()
	r, err := p.inner.RegisterDomain(ctx, req)
	p.record("register_domain", start, err)
	return r, err
}

func (p *Instrumented) RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error) {
	start := time.Now()
	r, err := p.inner.RenewDomain(ctx, name, req)
	p.record("renew_domain", start, err)
	return r, err
}

func (p *Instrumented) GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error) {
	start := time.Now()
	r, err := p.inner.GetRegisterStatus(ctx, jobID)
	p.record("get_register_status", start, err)
	return r, err
}

func (p *Instrumented) RetryRegister(ctx context.Context, jobID string) (*RegisterStatus, error) {
	start := time.Now()
	r, err := p.inner.RetryRegister(ctx, jobID)
	p.record("retry_register", start, err)
	return r, err
}

func (p *Instrumented) CancelRegister(ctx context.Context, jobID string) error {
	start := time.Now()
	err := p.inner.CancelRegister(ctx, jobID)
	p.record("cancel_register", start, err)
	return err
}

func (p *Instrumented) InfoDomain(ctx context.Context, name string) (*DomainInfo, error) {
	start := time.Now()
	r, err := p.inner.InfoDomain(ctx, name)
	p.record("info_domain", start, err)
	return r, err
}

func (p *Instrumented) GetNameservers(ctx context.Context, name string) (*NameserverInfo, error) {
	start := time.Now()
	r, err := p.inner.GetNameservers(ctx, name)
	p.record("get_nameservers", start, err)
	return r, err
}

func (p *Instrumented) UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	start := time.Now()
	r, err := p.inner.UpdateNameservers(ctx, name, ns)
	p.record("update_nameservers", start, err)
	return r, err
}

func (p *Instrumented) GetContact(ctx context.Context, id uint64) (*Contact, error) {
	start := time.Now()
	r, err := p.inner.GetContact(ctx, id)
	p.record("get_contact", start, err)
	return r, err
}

func (p *Instrumented) UpdateContactByID(ctx context.Context, id uint64, req UpdateContactRequest) (*UpdateContactResponse, error) {
	start := time.Now()
	r, err := p.inner.UpdateContactByID(ctx, id, req)
	p.record("update_contact_by_id", start, err)
	return r, err
}

func (p *Instrumented) UpdateDomainContact(ctx context.Context, name string, req UpdateContactRequest) (*UpdateContactResponse, error) {
	start := time.Now()
	r, err := p.inner.UpdateDomainContact(ctx, name, req)
	p.record("update_domain_contact", start, err)
	return r, err
}

func (p *Instrumented) Whois(ctx context.Context, domain string) (*Whois, error) {
	start := time.Now()
	r, err := p.inner.Whois(ctx, domain)
	p.record("whois", start, err)
	return r, err
}

// Compile-time guard.
var _ Provider = (*Instrumented)(nil)
