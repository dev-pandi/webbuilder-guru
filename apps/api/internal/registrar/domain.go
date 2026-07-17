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
//	GET /api/global/get-domain-price/:domain
//
// Public = no auth. Safe to call from any web builder route (e.g. an inline
// price hint while the user types "myshop.id").
func (c *Client) GetDomainPrice(ctx context.Context, domain string) (*DomainPrice, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[DomainPrice]
	if err := c.do(ctx, "GET", "/api/global/get-domain-price/"+url.PathEscape(domain), nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// Whois hits the existing public endpoint:
//
//	GET /api/global/whois?domain=...
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
	err := c.do(ctx, "GET", "/api/global/whois?domain="+url.QueryEscape(domain), nil, &env)
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

// CheckAvailability is a semantic wrapper around Whois — some callers prefer
// a bool over parsing a Whois record. Registrar-api may add a dedicated
// endpoint later; when that lands, swap the impl without touching callers.
func (c *Client) CheckAvailability(ctx context.Context, domain string) (*Availability, error) {
	w, err := c.Whois(ctx, domain)
	if err != nil {
		return nil, err
	}
	if w == nil {
		return &Availability{Domain: domain, Available: true}, nil
	}
	return &Availability{Domain: domain, Available: false, Reason: w.Status}, nil
}

// RegisterDomain starts a domain purchase on behalf of a user.
//
// TBD: endpoint path below assumes the reseller endpoint registrar-api will
// expose. Path + response shape confirmed with registrar-api team before
// going live:
//
//	POST /api/reseller/domain/register
//	Success: 202 Accepted + RegisterResponse
//
// Idempotent by req.IdempotencyKey — safe to retry the SAME request; a fresh
// UUID per checkout attempt should be generated at the call site.
func (c *Client) RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	var env envelope[RegisterResponse]
	if err := c.do(ctx, "POST", "/api/reseller/domain/register", req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// GetRegisterStatus polls the state of a pending registration.
//
// TBD path — see RegisterDomain. Meant to be called by a webhook OR a short
// dashboard polling loop.
func (c *Client) GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error) {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "job_id kosong"}
	}
	var env envelope[RegisterStatus]
	if err := c.do(ctx, "GET", "/api/reseller/domain/register/"+url.PathEscape(jobID)+"/status", nil, &env); err != nil {
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
