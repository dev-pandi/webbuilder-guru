package resilience

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/webbuilder/api-registry/internal/metrics"
	"github.com/webbuilder/api-registry/internal/provider"
)

// Config — full config buat Provider decorator.
type Config struct {
	Retry   RetryConfig
	Breaker BreakerConfig
	Enabled bool // false = pass-through (no retry, no breaker)
}

// Provider — decorator yang layer retry + circuit breaker di atas concrete
// provider. Order: breaker check → (retry loop → op call) → breaker update.
//
// Kalau `Config.Enabled=false`, pass-through langsung ke inner — no overhead.
// Cocok untuk dev mode / integration test yang tidak butuh resilience.
type Provider struct {
	inner    provider.Provider
	cfg      Config
	breakers *Registry
}

func NewProvider(inner provider.Provider, cfg Config) *Provider {
	return &Provider{
		inner:    inner,
		cfg:      cfg,
		breakers: NewRegistry(cfg.Breaker),
	}
}

func (p *Provider) Name() string                    { return p.inner.Name() + "+resilience" }
func (p *Provider) Capabilities() provider.Capabilities { return p.inner.Capabilities() }

// wrap — helper untuk semua Provider method. Ambil breaker per op, cek
// circuit + retry.
func (p *Provider) wrap(ctx context.Context, op string, fn func() error) error {
	if !p.cfg.Enabled {
		return fn()
	}
	b := p.breakers.Get(op)
	if !b.Allow() {
		metrics.Default.CounterInc(
			"api_registry_circuit_open_total",
			"Requests rejected karena circuit breaker open",
			map[string]string{"operation": op, "provider": p.inner.Name()},
		)
		return fmt.Errorf("%w (operation=%s)", ErrCircuitOpen, op)
	}

	// Wrap fn dengan record ke breaker + metrics.
	err := Retry(ctx, p.cfg.Retry, fn)
	if err == nil {
		b.RecordSuccess()
		return nil
	}
	// Cuma record failure ke breaker kalau transient (upstream fault).
	// Deterministic client error TIDAK trigger circuit open — user salah input
	// bukan indikator upstream down.
	if IsTransient(err) {
		b.RecordFailure()
		metrics.Default.CounterInc(
			"api_registry_retry_exhausted_total",
			"Provider call gagal setelah retry attempts exhausted",
			map[string]string{"operation": op, "provider": p.inner.Name()},
		)
		if b.State() == StateOpen {
			slog.Warn("resilience: circuit tripped open",
				"operation", op, "provider", p.inner.Name(), "err", err)
		}
	}
	return err
}

// --- Provider method delegations ---

func (p *Provider) CheckDomain(ctx context.Context, req provider.CheckRequest) (*provider.CheckResponse, error) {
	var res *provider.CheckResponse
	err := p.wrap(ctx, "check_domain", func() error {
		r, err := p.inner.CheckDomain(ctx, req)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) BulkCheckDomains(ctx context.Context, req provider.BulkCheckRequest) (*provider.BulkCheckResponse, error) {
	var res *provider.BulkCheckResponse
	err := p.wrap(ctx, "bulk_check_domains", func() error {
		r, err := p.inner.BulkCheckDomains(ctx, req)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) ListDomains(ctx context.Context, f provider.ListDomainsFilter) (*provider.DomainListResponse, error) {
	var res *provider.DomainListResponse
	err := p.wrap(ctx, "list_domains", func() error {
		r, err := p.inner.ListDomains(ctx, f)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) RegisterDomain(ctx context.Context, req provider.RegisterRequest) (*provider.RegisterResponse, error) {
	// SPECIAL: register dengan idempotency key SAFE di-retry karena
	// registrar dedup by key. Tanpa key, retry bisa dobel-charge —
	// consumer wajib provide key (handler enforce). Di sini kita trust.
	var res *provider.RegisterResponse
	err := p.wrap(ctx, "register_domain", func() error {
		r, err := p.inner.RegisterDomain(ctx, req)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) RenewDomain(ctx context.Context, name string, req provider.RenewRequest) (*provider.RegisterResponse, error) {
	var res *provider.RegisterResponse
	err := p.wrap(ctx, "renew_domain", func() error {
		r, err := p.inner.RenewDomain(ctx, name, req)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) GetRegisterStatus(ctx context.Context, jobID string) (*provider.RegisterStatus, error) {
	var res *provider.RegisterStatus
	err := p.wrap(ctx, "get_register_status", func() error {
		r, err := p.inner.GetRegisterStatus(ctx, jobID)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) RetryRegister(ctx context.Context, jobID string) (*provider.RegisterStatus, error) {
	var res *provider.RegisterStatus
	err := p.wrap(ctx, "retry_register", func() error {
		r, err := p.inner.RetryRegister(ctx, jobID)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) CancelRegister(ctx context.Context, jobID string) error {
	return p.wrap(ctx, "cancel_register", func() error {
		return p.inner.CancelRegister(ctx, jobID)
	})
}

func (p *Provider) InfoDomain(ctx context.Context, name string) (*provider.DomainInfo, error) {
	var res *provider.DomainInfo
	err := p.wrap(ctx, "info_domain", func() error {
		r, err := p.inner.InfoDomain(ctx, name)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) GetNameservers(ctx context.Context, name string) (*provider.NameserverInfo, error) {
	var res *provider.NameserverInfo
	err := p.wrap(ctx, "get_nameservers", func() error {
		r, err := p.inner.GetNameservers(ctx, name)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) UpdateNameservers(ctx context.Context, name string, ns []string) (*provider.NameserverInfo, error) {
	var res *provider.NameserverInfo
	err := p.wrap(ctx, "update_nameservers", func() error {
		r, err := p.inner.UpdateNameservers(ctx, name, ns)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) GetContact(ctx context.Context, id uint64) (*provider.Contact, error) {
	var res *provider.Contact
	err := p.wrap(ctx, "get_contact", func() error {
		r, err := p.inner.GetContact(ctx, id)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) UpdateContactByID(ctx context.Context, id uint64, req provider.UpdateContactRequest) (*provider.UpdateContactResponse, error) {
	var res *provider.UpdateContactResponse
	err := p.wrap(ctx, "update_contact_by_id", func() error {
		r, err := p.inner.UpdateContactByID(ctx, id, req)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) UpdateDomainContact(ctx context.Context, name string, req provider.UpdateContactRequest) (*provider.UpdateContactResponse, error) {
	var res *provider.UpdateContactResponse
	err := p.wrap(ctx, "update_domain_contact", func() error {
		r, err := p.inner.UpdateDomainContact(ctx, name, req)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) Whois(ctx context.Context, domain string) (*provider.Whois, error) {
	var res *provider.Whois
	err := p.wrap(ctx, "whois", func() error {
		r, err := p.inner.Whois(ctx, domain)
		res = r
		return err
	})
	return res, err
}

func (p *Provider) UploadDocument(ctx context.Context, req provider.UploadDocumentRequest) (*provider.UploadDocumentResponse, error) {
	// Multipart upload TIDAK di-retry — body bisa besar (8 MiB), retry
	// buang bandwidth + no idempotency guarantee upstream. Kalau butuh,
	// consumer retry di level HTTP.
	if !p.cfg.Enabled {
		return p.inner.UploadDocument(ctx, req)
	}
	b := p.breakers.Get("upload_document")
	if !b.Allow() {
		return nil, fmt.Errorf("%w (operation=upload_document)", ErrCircuitOpen)
	}
	r, err := p.inner.UploadDocument(ctx, req)
	if err == nil {
		b.RecordSuccess()
	} else if IsTransient(err) {
		b.RecordFailure()
	}
	return r, err
}

func (p *Provider) ListDocuments(ctx context.Context, externalUserID string) (*provider.DocumentsListResponse, error) {
	var res *provider.DocumentsListResponse
	err := p.wrap(ctx, "list_documents", func() error {
		r, err := p.inner.ListDocuments(ctx, externalUserID)
		res = r
		return err
	})
	return res, err
}

var _ provider.Provider = (*Provider)(nil)

// Guard supaya errors import tetap dipakai di masa depan.
var _ = errors.Is
