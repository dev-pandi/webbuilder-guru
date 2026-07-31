package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// --- Domain lifecycle ---

// BulkCheckDomains — registrar-api /reseller/domain/check tetap terima 1
// SLD/FQDN per request. Untuk batch, kita fan-out sequential — hemat
// implementation kompleksitas untuk MVP. Kalau nanti PANDI expose batch
// endpoint native, swap di sini tanpa touch interface / consumer.
func (p *PandiWrapperProvider) BulkCheckDomains(ctx context.Context, req BulkCheckRequest) (*BulkCheckResponse, error) {
	if len(req.Domains) == 0 {
		return nil, fmt.Errorf("%w: domains kosong", ErrValidation)
	}
	if len(req.Domains) > 50 {
		return nil, fmt.Errorf("%w: max 50 domain per request", ErrValidation)
	}
	out := &BulkCheckResponse{Results: make([]CheckEntry, 0, len(req.Domains))}
	for _, d := range req.Domains {
		res, err := p.CheckDomain(ctx, CheckRequest{Domain: d, ExternalUserID: req.ExternalUserID})
		if err != nil {
			// Skip domain error individual — record entry dengan reason supaya
			// consumer bisa map error per domain tanpa fail seluruh batch.
			out.Results = append(out.Results, CheckEntry{
				Domain:    strings.ToLower(strings.TrimSpace(d)),
				Available: false,
				Reason:    "check_failed: " + err.Error(),
			})
			continue
		}
		if len(res.Results) > 0 {
			out.Results = append(out.Results, res.Results...)
		}
	}
	return out, nil
}

// ListDomains — proxy GET /reseller/domain/list dengan filter external_user_id.
func (p *PandiWrapperProvider) ListDomains(ctx context.Context, f ListDomainsFilter) (*DomainListResponse, error) {
	q := url.Values{}
	if f.ExternalUserID != "" {
		q.Set("external_user_id", f.ExternalUserID)
	}
	if f.Page > 0 {
		q.Set("page", strconv.Itoa(f.Page))
	}
	if f.PerPage > 0 {
		q.Set("perPage", strconv.Itoa(f.PerPage))
	}
	path := "/v1/api/user/reseller/domain/list"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var env envelope[DomainListResponse]
	if err := p.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) CheckDomain(ctx context.Context, req CheckRequest) (*CheckResponse, error) {
	body := map[string]string{"domain": strings.ToLower(strings.TrimSpace(req.Domain))}
	if req.ExternalUserID != "" {
		body["external_user_id"] = req.ExternalUserID
	}
	var env envelope[CheckResponse]
	if err := p.do(ctx, "POST", "/v1/api/user/reseller/domain/check", body, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// registrarRegisterReq — payload registrar-api /reseller/domain/register.
// Registrar-api butuh field yang beda-beda sedikit dari provider.Contact,
// jadi kita build shape sini untuk kompatibilitas.
type registrarRegisterReq struct {
	Domain         string  `json:"domain"`
	Years          int     `json:"years"`
	ExternalUserID string  `json:"external_user_id"`
	IdempotencyKey string  `json:"idempotency_key"`
	Contact        Contact `json:"contact"`
	Nameservers    []string `json:"nameservers,omitempty"`
	DocumentIDs    []int64  `json:"document_ids,omitempty"`
}

func (p *PandiWrapperProvider) RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	body := registrarRegisterReq{
		Domain:         strings.ToLower(strings.TrimSpace(req.Domain)),
		Years:          req.Years,
		ExternalUserID: req.ExternalUserID,
		IdempotencyKey: req.IdempotencyKey,
		Contact:        req.Contact,
		Nameservers:    req.Nameservers,
		DocumentIDs:    req.DocumentIDs,
	}
	var env envelope[RegisterResponse]
	if err := p.do(ctx, "POST", "/v1/api/user/reseller/domain/register", body, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, fmt.Errorf("%w: domain kosong", ErrValidation)
	}
	var env envelope[RegisterResponse]
	if err := p.do(ctx, "POST", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/renew", req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error) {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, fmt.Errorf("%w: job_id kosong", ErrValidation)
	}
	var env envelope[RegisterStatus]
	if err := p.do(ctx, "GET", "/v1/api/user/reseller/domain/register/"+url.PathEscape(jobID)+"/status", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) RetryRegister(ctx context.Context, jobID string) (*RegisterStatus, error) {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, fmt.Errorf("%w: job_id kosong", ErrValidation)
	}
	var env envelope[RegisterStatus]
	if err := p.do(ctx, "POST", "/v1/api/user/reseller/domain/register/"+url.PathEscape(jobID)+"/retry", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) CancelRegister(ctx context.Context, jobID string) error {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return fmt.Errorf("%w: job_id kosong", ErrValidation)
	}
	return p.do(ctx, "POST", "/v1/api/user/reseller/domain/register/"+url.PathEscape(jobID)+"/cancel", nil, nil)
}

// InfoDomain — registrar-api tidak expose EPP domain:info langsung; kita
// bisa fallback ke ListDomains filter by name atau Whois. Untuk MVP, pakai
// Whois shape yang di-map ke DomainInfo (nanti EPPDirect punya real info).
func (p *PandiWrapperProvider) InfoDomain(ctx context.Context, name string) (*DomainInfo, error) {
	return nil, fmt.Errorf("%w: InfoDomain belum tersedia via pandi_wrapper (butuh EPP direct)", ErrCapabilityMissing)
}

// --- Nameserver ---

func (p *PandiWrapperProvider) GetNameservers(ctx context.Context, name string) (*NameserverInfo, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, fmt.Errorf("%w: domain kosong", ErrValidation)
	}
	var env envelope[NameserverInfo]
	if err := p.do(ctx, "GET", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/nameservers", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, fmt.Errorf("%w: domain kosong", ErrValidation)
	}
	body := map[string][]string{"nameservers": ns}
	var env envelope[NameserverInfo]
	if err := p.do(ctx, "POST", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/nameservers", body, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// --- Contact ---

func (p *PandiWrapperProvider) GetContact(ctx context.Context, contactID uint64) (*Contact, error) {
	if contactID == 0 {
		return nil, fmt.Errorf("%w: contact_id kosong", ErrValidation)
	}
	// Registrar shape lebih lengkap; kita map subset ke Contact.
	var env envelope[struct {
		Name       string `json:"name"`
		Email      string `json:"email"`
		Phone      string `json:"phone"`
		Address    string `json:"address"`
		City       string `json:"city"`
		State      string `json:"state"`
		PostalCode string `json:"postal_code"`
	}]
	path := "/v1/api/user/reseller/contacts/" + strconv.FormatUint(contactID, 10)
	if err := p.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &Contact{
		Name:       env.Data.Name,
		Email:      env.Data.Email,
		Phone:      env.Data.Phone,
		Address:    env.Data.Address,
		City:       env.Data.City,
		State:      env.Data.State,
		PostalCode: env.Data.PostalCode,
		CountryCode: "ID",
	}, nil
}

func (p *PandiWrapperProvider) UpdateContactByID(ctx context.Context, contactID uint64, req UpdateContactRequest) (*UpdateContactResponse, error) {
	if contactID == 0 {
		return nil, fmt.Errorf("%w: contact_id kosong", ErrValidation)
	}
	var env envelope[UpdateContactResponse]
	path := "/v1/api/user/reseller/contacts/" + strconv.FormatUint(contactID, 10)
	if err := p.do(ctx, "PATCH", path, req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

func (p *PandiWrapperProvider) UpdateDomainContact(ctx context.Context, name string, req UpdateContactRequest) (*UpdateContactResponse, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, fmt.Errorf("%w: domain kosong", ErrValidation)
	}
	var env envelope[UpdateContactResponse]
	path := "/v1/api/user/reseller/domain/" + url.PathEscape(name) + "/contact"
	if err := p.do(ctx, "PATCH", path, req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// --- WHOIS ---

func (p *PandiWrapperProvider) Whois(ctx context.Context, domain string) (*Whois, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, fmt.Errorf("%w: domain kosong", ErrValidation)
	}
	var env envelope[Whois]
	path := "/v1/api/whois?domain=" + url.QueryEscape(domain)
	if err := p.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	// Registrar return status="available" untuk domain unregistered.
	// Kita passthrough — konsumer decide.
	return &env.Data, nil
}

// --- helper: compile-time guard bahwa PandiWrapperProvider implement Provider ---
var _ Provider = (*PandiWrapperProvider)(nil)

// Kompilasi trigger untuk ensure package json di-import (dipakai marshal).
var _ = json.Marshal
