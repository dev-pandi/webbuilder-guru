package provider

import (
	"context"
	"fmt"
	"sync"
)

// FakeProvider — in-memory implementation Provider yang predictable untuk
// handler test. Rekam call history + izinkan inject error / response.
// Public API supaya bisa dipakai lintas package test (domains_test dsb.)
// tanpa duplikasi kode.
//
// Contoh:
//   fp := provider.NewFake()
//   fp.CheckFn = func(ctx, req) (*CheckResponse, error) { return ..., nil }
//   h := domains.NewHandler(fp, nil)
//   // app.Test(req) ...
type FakeProvider struct {
	mu    sync.Mutex
	Calls []FakeCall

	// Override function per method — nil = default response (nil, nil).
	CheckFn                func(context.Context, CheckRequest) (*CheckResponse, error)
	BulkCheckFn            func(context.Context, BulkCheckRequest) (*BulkCheckResponse, error)
	RegisterFn             func(context.Context, RegisterRequest) (*RegisterResponse, error)
	RenewFn                func(context.Context, string, RenewRequest) (*RegisterResponse, error)
	GetRegisterStatusFn    func(context.Context, string) (*RegisterStatus, error)
	RetryFn                func(context.Context, string) (*RegisterStatus, error)
	CancelFn               func(context.Context, string) error
	InfoDomainFn           func(context.Context, string) (*DomainInfo, error)
	ListDomainsFn          func(context.Context, ListDomainsFilter) (*DomainListResponse, error)
	GetNSFn                func(context.Context, string) (*NameserverInfo, error)
	UpdateNSFn             func(context.Context, string, []string) (*NameserverInfo, error)
	GetContactFn           func(context.Context, uint64) (*Contact, error)
	UpdateContactByIDFn    func(context.Context, uint64, UpdateContactRequest) (*UpdateContactResponse, error)
	UpdateDomainContactFn  func(context.Context, string, UpdateContactRequest) (*UpdateContactResponse, error)
	WhoisFn                func(context.Context, string) (*Whois, error)
	UploadDocumentFn       func(context.Context, UploadDocumentRequest) (*UploadDocumentResponse, error)
	ListDocumentsFn        func(context.Context, string) (*DocumentsListResponse, error)

	// Capabilities di-override kalau perlu test capability-guard behavior.
	CapsOverride *Capabilities
}

// FakeCall — 1 record dari call history. Method + args dalam bentuk
// map[string]any untuk fleksibilitas.
type FakeCall struct {
	Method string
	Args   map[string]any
}

func NewFake() *FakeProvider {
	return &FakeProvider{}
}

func (p *FakeProvider) recordCall(method string, args map[string]any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Calls = append(p.Calls, FakeCall{Method: method, Args: args})
}

func (p *FakeProvider) CallCount(method string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	n := 0
	for _, c := range p.Calls {
		if c.Method == method {
			n++
		}
	}
	return n
}

func (p *FakeProvider) Name() string { return "fake" }

func (p *FakeProvider) Capabilities() Capabilities {
	if p.CapsOverride != nil {
		return *p.CapsOverride
	}
	return Capabilities{
		HasWallet:        false,
		HasDocumentFlow:  true,
		HasBulkCheck:     true,
		HasTransfer:      false,
		HasDNSSEC:        false,
		HasPromoInternal: false,
		HasContact:       true,
	}
}

func (p *FakeProvider) CheckDomain(ctx context.Context, req CheckRequest) (*CheckResponse, error) {
	p.recordCall("CheckDomain", map[string]any{"domain": req.Domain})
	if p.CheckFn != nil {
		return p.CheckFn(ctx, req)
	}
	return &CheckResponse{Query: req.Domain, AllowedZones: []string{"id"}, Results: []CheckEntry{}}, nil
}

func (p *FakeProvider) BulkCheckDomains(ctx context.Context, req BulkCheckRequest) (*BulkCheckResponse, error) {
	p.recordCall("BulkCheckDomains", map[string]any{"count": len(req.Domains)})
	if p.BulkCheckFn != nil {
		return p.BulkCheckFn(ctx, req)
	}
	return &BulkCheckResponse{Results: []CheckEntry{}}, nil
}

func (p *FakeProvider) RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	p.recordCall("RegisterDomain", map[string]any{"domain": req.Domain, "years": req.Years})
	if p.RegisterFn != nil {
		return p.RegisterFn(ctx, req)
	}
	return &RegisterResponse{JobID: "job_fake_" + req.Domain, Status: "pending_payment"}, nil
}

func (p *FakeProvider) RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error) {
	p.recordCall("RenewDomain", map[string]any{"domain": name, "years": req.Years})
	if p.RenewFn != nil {
		return p.RenewFn(ctx, name, req)
	}
	return &RegisterResponse{JobID: "job_renew_" + name, Status: "pending_payment"}, nil
}

func (p *FakeProvider) GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error) {
	p.recordCall("GetRegisterStatus", map[string]any{"job_id": jobID})
	if p.GetRegisterStatusFn != nil {
		return p.GetRegisterStatusFn(ctx, jobID)
	}
	return &RegisterStatus{JobID: jobID, Status: "active"}, nil
}

func (p *FakeProvider) RetryRegister(ctx context.Context, jobID string) (*RegisterStatus, error) {
	p.recordCall("RetryRegister", map[string]any{"job_id": jobID})
	if p.RetryFn != nil {
		return p.RetryFn(ctx, jobID)
	}
	return &RegisterStatus{JobID: jobID, Status: "pending_provisioning"}, nil
}

func (p *FakeProvider) CancelRegister(ctx context.Context, jobID string) error {
	p.recordCall("CancelRegister", map[string]any{"job_id": jobID})
	if p.CancelFn != nil {
		return p.CancelFn(ctx, jobID)
	}
	return nil
}

func (p *FakeProvider) InfoDomain(ctx context.Context, name string) (*DomainInfo, error) {
	p.recordCall("InfoDomain", map[string]any{"domain": name})
	if p.InfoDomainFn != nil {
		return p.InfoDomainFn(ctx, name)
	}
	return nil, fmt.Errorf("%w: fake InfoDomain default", ErrCapabilityMissing)
}

func (p *FakeProvider) ListDomains(ctx context.Context, f ListDomainsFilter) (*DomainListResponse, error) {
	p.recordCall("ListDomains", map[string]any{"external_user_id": f.ExternalUserID, "page": f.Page})
	if p.ListDomainsFn != nil {
		return p.ListDomainsFn(ctx, f)
	}
	return &DomainListResponse{Items: []DomainListItem{}}, nil
}

func (p *FakeProvider) GetNameservers(ctx context.Context, name string) (*NameserverInfo, error) {
	p.recordCall("GetNameservers", map[string]any{"domain": name})
	if p.GetNSFn != nil {
		return p.GetNSFn(ctx, name)
	}
	return &NameserverInfo{Domain: name, Nameservers: []string{"ns1.default.com", "ns2.default.com"}}, nil
}

func (p *FakeProvider) UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	p.recordCall("UpdateNameservers", map[string]any{"domain": name, "count": len(ns)})
	if p.UpdateNSFn != nil {
		return p.UpdateNSFn(ctx, name, ns)
	}
	return &NameserverInfo{Domain: name, Nameservers: ns}, nil
}

func (p *FakeProvider) GetContact(ctx context.Context, id uint64) (*Contact, error) {
	p.recordCall("GetContact", map[string]any{"id": id})
	if p.GetContactFn != nil {
		return p.GetContactFn(ctx, id)
	}
	return &Contact{Name: "Fake User", Email: "fake@example.com"}, nil
}

func (p *FakeProvider) UpdateContactByID(ctx context.Context, id uint64, req UpdateContactRequest) (*UpdateContactResponse, error) {
	p.recordCall("UpdateContactByID", map[string]any{"id": id})
	if p.UpdateContactByIDFn != nil {
		return p.UpdateContactByIDFn(ctx, id, req)
	}
	return &UpdateContactResponse{ContactID: id, Name: req.Name, Email: req.Email, Message: "contact updated (fake)"}, nil
}

func (p *FakeProvider) UpdateDomainContact(ctx context.Context, name string, req UpdateContactRequest) (*UpdateContactResponse, error) {
	p.recordCall("UpdateDomainContact", map[string]any{"domain": name})
	if p.UpdateDomainContactFn != nil {
		return p.UpdateDomainContactFn(ctx, name, req)
	}
	return &UpdateContactResponse{Domain: name, ContactID: 1, Name: req.Name, Email: req.Email, Message: "contact updated (fake)"}, nil
}

func (p *FakeProvider) Whois(ctx context.Context, domain string) (*Whois, error) {
	p.recordCall("Whois", map[string]any{"domain": domain})
	if p.WhoisFn != nil {
		return p.WhoisFn(ctx, domain)
	}
	return &Whois{Domain: domain, Status: "registered"}, nil
}

func (p *FakeProvider) UploadDocument(ctx context.Context, req UploadDocumentRequest) (*UploadDocumentResponse, error) {
	p.recordCall("UploadDocument", map[string]any{
		"external_user_id": req.ExternalUserID,
		"category_id":      req.CategoryID,
		"filename":         req.Filename,
		"size":             len(req.Body),
	})
	if p.UploadDocumentFn != nil {
		return p.UploadDocumentFn(ctx, req)
	}
	return &UploadDocumentResponse{ID: 42, Filename: req.Filename, CategoryID: req.CategoryID, Status: "pending"}, nil
}

func (p *FakeProvider) ListDocuments(ctx context.Context, externalUserID string) (*DocumentsListResponse, error) {
	p.recordCall("ListDocuments", map[string]any{"external_user_id": externalUserID})
	if p.ListDocumentsFn != nil {
		return p.ListDocumentsFn(ctx, externalUserID)
	}
	return &DocumentsListResponse{Items: []DocumentItem{}}, nil
}

var _ Provider = (*FakeProvider)(nil)
