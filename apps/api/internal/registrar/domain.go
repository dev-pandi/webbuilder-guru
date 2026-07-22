package registrar

import (
	"context"
	"net/url"
	"strings"
)

// Domain lookups.
//
// Split from client.go so the transport plumbing stays reusable across future
// concerns (contacts, hosts, invoices) — those get their own files later.

// GetDomainPrice hits the existing public endpoint:
//
//	GET /v1/api/get-domain-price/:domain
//
// Public = no auth. Safe to call from any web builder route (e.g. an inline
// price hint while the user types "myshop.id").
func (c *Client) GetDomainPrice(ctx context.Context, domain string) (*DomainPrice, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[DomainPrice]
	if err := c.do(ctx, "GET", "/v1/api/get-domain-price/"+url.PathEscape(domain), nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// Whois hits the existing public endpoint:
//
//	GET /v1/api/whois?domain=...
//
// Useful for the "domain is taken" preview. If the domain is NOT registered
// registrar-api may return either 404 or a Whois with Status="available" —
// we normalise both to (nil, nil) so callers can branch cleanly. Any other
// error propagates.
func (c *Client) Whois(ctx context.Context, domain string) (*Whois, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[Whois]
	err := c.do(ctx, "GET", "/v1/api/whois?domain="+url.QueryEscape(domain), nil, &env)
	if err != nil {
		if apiErr, ok := asAPIError(err); ok && apiErr.Status == 404 {
			return nil, nil
		}
		return nil, err
	}
	// Treat explicit "available" status as "not registered".
	if strings.EqualFold(env.Data.Status, "available") {
		return nil, nil
	}
	return &env.Data, nil
}

// CheckDomain hits the reseller endpoint yang balik availability + harga +
// zone flags dalam satu response:
//
//	POST /v1/api/user/reseller/domain/check
//	body: {"domain": "..."}
//
// Wajib reseller auth (Bearer). Zone info (`RequireDocument`, dst.) hanya
// diisi kalau zone terdaftar di registrar. Kalau tidak, tetap balik price +
// availability tanpa Zone.
type checkDomainRegistrarResp struct {
	Domain    string     `json:"domain"`
	TLD       string     `json:"tld"`
	Available bool       `json:"available"`
	Reason    string     `json:"reason"`
	Price     *priceInfo `json:"price,omitempty"`
	Zone      *ZoneInfo  `json:"zone,omitempty"`
}

// priceInfo mirrors reseller check response's price block.
type priceInfo struct {
	Currency string  `json:"currency"`
	Register float64 `json:"register"`
	Renew    float64 `json:"renew"`
	Transfer float64 `json:"transfer"`
}

// CheckDomain unified call untuk wizard — return semua yang dibutuhkan
// (availability + price + zone flags) sekali panggil.
func (c *Client) CheckDomain(ctx context.Context, domain string) (*Availability, *DomainPrice, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[checkDomainRegistrarResp]
	body := map[string]string{"domain": domain}
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/domain/check", body, &env); err != nil {
		return nil, nil, err
	}
	avail := &Availability{
		Domain:    env.Data.Domain,
		Available: env.Data.Available,
		Reason:    env.Data.Reason,
		Zone:      env.Data.Zone,
	}
	var price *DomainPrice
	if env.Data.Price != nil {
		price = &DomainPrice{
			Domain:   env.Data.Domain,
			TLD:      env.Data.TLD,
			Currency: env.Data.Price.Currency,
			Register: int64(env.Data.Price.Register),
			Renew:    int64(env.Data.Price.Renew),
			Transfer: int64(env.Data.Price.Transfer),
		}
	}
	return avail, price, nil
}

// CheckAvailability is a semantic wrapper — pakai reseller CheckDomain
// karena butuh zone info. Kalau reseller call gagal (misal registrar down),
// fallback ke public Whois untuk minimal availability sinyal.
func (c *Client) CheckAvailability(ctx context.Context, domain string) (*Availability, error) {
	avail, _, err := c.CheckDomain(ctx, domain)
	if err == nil {
		return avail, nil
	}
	// Fallback: reseller call gagal (401/5xx). Public whois masih bisa jawab
	// availability tanpa harga/zone. Better than blocking user.
	w, wErr := c.Whois(ctx, domain)
	if wErr != nil {
		return nil, err // return error asli dari reseller call
	}
	if w == nil {
		return &Availability{Domain: domain, Available: true}, nil
	}
	return &Availability{Domain: domain, Available: false, Reason: w.Status}, nil
}

// RegisterDomain starts a domain purchase on behalf of a user.
//
//	POST /v1/api/user/reseller/domain/register
//	Success: 202 Accepted + RegisterResponse
//
// Idempotent by req.IdempotencyKey — safe to retry the SAME request; a fresh
// UUID per checkout attempt should be generated at the call site.
func (c *Client) RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	var env envelope[RegisterResponse]
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/domain/register", req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// RenewDomain trigger perpanjangan domain. Registrar bikin job baru
// dengan kind=renew + invoice + payment URL — flow polling sama dengan
// register. Domain harus milik reseller yang sama.
//
//	POST /v1/api/user/reseller/domain/:name/renew
//	body: RenewRequest
//	response: RegisterResponse (job_id, payment_url, status)
func (c *Client) RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[RegisterResponse]
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/renew", req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// NameserverInfo — response shape dari registrar's GET/POST nameserver endpoints.
type NameserverInfo struct {
	Domain      string   `json:"domain"`
	Nameservers []string `json:"nameservers"`
}

// GetNameservers baca list NS current dari EPP (source of truth) via registrar.
//
//	GET /v1/api/user/reseller/domain/:name/nameservers
//
// Domain harus milik reseller yang login — registrar enforce ownership,
// tapi web builder juga verify di caller (defence in depth).
func (c *Client) GetNameservers(ctx context.Context, name string) (*NameserverInfo, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[NameserverInfo]
	if err := c.do(ctx, "GET", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/nameservers", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// UpdateNameservers replace-all NS via EPP + sync ke domain_hosts di
// registrar. Min 2, max 13 hostnames; format valid (registrar validate).
//
//	POST /v1/api/user/reseller/domain/:name/nameservers
//	body: {"nameservers": ["ns1.example.com", "ns2.example.com"]}
func (c *Client) UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[NameserverInfo]
	body := map[string][]string{"nameservers": ns}
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/nameservers", body, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// RetryDomain triggers ulang EPP CREATE untuk job yang status=failed.
//
//	POST /v1/api/user/reseller/domain/register/:job_id/retry
//
// Dipakai oleh recovery flow: setelah payment sukses tapi EPP fail (misal
// zone down, contact:create error), operator/user bisa retry tanpa bayar
// ulang. Job harus dalam status "failed" — kalau tidak, registrar reject.
func (c *Client) RetryDomain(ctx context.Context, jobID string) (*RegisterStatus, error) {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "job_id kosong"}
	}
	var env envelope[RegisterStatus]
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/domain/register/"+url.PathEscape(jobID)+"/retry", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// GetRegisterStatus polls the state of a pending registration.
//
//	GET /v1/api/user/reseller/domain/register/:job_id/status
func (c *Client) GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error) {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "job_id kosong"}
	}
	var env envelope[RegisterStatus]
	if err := c.do(ctx, "GET", "/v1/api/user/reseller/domain/register/"+url.PathEscape(jobID)+"/status", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// asAPIError is the internal counterpart of the public IsAPIError. Named
// separately because we return the *APIError value itself, not a bool.
func asAPIError(err error) (*APIError, bool) {
	if apiErr, ok := err.(*APIError); ok {
		return apiErr, true
	}
	return nil, false
}
