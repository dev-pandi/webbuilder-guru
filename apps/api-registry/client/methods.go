package client

import (
	"context"
	"net/url"
	"strconv"
)

// --- Domain lifecycle ---

func (c *Client) CheckDomain(ctx context.Context, req CheckRequest) (*CheckResponse, error) {
	var out CheckResponse
	if err := c.do(ctx, "POST", "/v1/domains/check", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) BulkCheckDomains(ctx context.Context, req BulkCheckRequest) (*BulkCheckResponse, error) {
	var out BulkCheckResponse
	if err := c.do(ctx, "POST", "/v1/domains/bulk-check", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

type ListDomainsFilter struct {
	ExternalUserID string
	Page           int
	PerPage        int
}

func (c *Client) ListDomains(ctx context.Context, f ListDomainsFilter) (*DomainListResponse, error) {
	kv := map[string]string{"external_user_id": f.ExternalUserID}
	if f.Page > 0 {
		kv["page"] = strconv.Itoa(f.Page)
	}
	if f.PerPage > 0 {
		kv["per_page"] = strconv.Itoa(f.PerPage)
	}
	var out DomainListResponse
	if err := c.do(ctx, "GET", withQuery("/v1/domains", kv), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	var out RegisterResponse
	if err := c.do(ctx, "POST", "/v1/domains/register", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error) {
	var out RegisterResponse
	if err := c.do(ctx, "POST", "/v1/domains/"+url.PathEscape(name)+"/renew", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error) {
	var out RegisterStatus
	if err := c.do(ctx, "GET", "/v1/domains/register/"+url.PathEscape(jobID)+"/status", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) RetryRegister(ctx context.Context, jobID string) (*RegisterStatus, error) {
	var out RegisterStatus
	if err := c.do(ctx, "POST", "/v1/domains/register/"+url.PathEscape(jobID)+"/retry", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) CancelRegister(ctx context.Context, jobID string) error {
	return c.do(ctx, "POST", "/v1/domains/register/"+url.PathEscape(jobID)+"/cancel", nil, nil)
}

func (c *Client) InfoDomain(ctx context.Context, name string) (*DomainInfo, error) {
	var out DomainInfo
	if err := c.do(ctx, "GET", "/v1/domains/"+url.PathEscape(name)+"/info", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// --- Nameserver ---

func (c *Client) GetNameservers(ctx context.Context, name string) (*NameserverInfo, error) {
	var out NameserverInfo
	if err := c.do(ctx, "GET", "/v1/domains/"+url.PathEscape(name)+"/nameservers", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	body := map[string][]string{"nameservers": ns}
	var out NameserverInfo
	if err := c.do(ctx, "POST", "/v1/domains/"+url.PathEscape(name)+"/nameservers", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// --- Contact ---

func (c *Client) GetContact(ctx context.Context, id uint64) (*Contact, error) {
	var out Contact
	if err := c.do(ctx, "GET", "/v1/contacts/"+strconv.FormatUint(id, 10), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) UpdateContactByID(ctx context.Context, id uint64, req UpdateContactRequest) (*UpdateContactResponse, error) {
	var out UpdateContactResponse
	if err := c.do(ctx, "PATCH", "/v1/contacts/"+strconv.FormatUint(id, 10), req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) UpdateDomainContact(ctx context.Context, name string, req UpdateContactRequest) (*UpdateContactResponse, error) {
	var out UpdateContactResponse
	if err := c.do(ctx, "PATCH", "/v1/domains/"+url.PathEscape(name)+"/contact", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// --- WHOIS ---

func (c *Client) Whois(ctx context.Context, domain string) (*Whois, error) {
	var out Whois
	if err := c.do(ctx, "GET", "/v1/whois?domain="+url.QueryEscape(domain), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// --- Jobs (audit) ---

func (c *Client) GetJob(ctx context.Context, id string) (*Job, error) {
	var out Job
	if err := c.do(ctx, "GET", "/v1/jobs/"+url.PathEscape(id), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

type ListJobsFilter struct {
	Kind           string
	Status         string
	Domain         string
	ExternalUserID string
	Limit          int
	Offset         int
}

func (c *Client) ListJobs(ctx context.Context, f ListJobsFilter) (*JobsListResponse, error) {
	kv := map[string]string{
		"kind":             f.Kind,
		"status":           f.Status,
		"domain":           f.Domain,
		"external_user_id": f.ExternalUserID,
	}
	if f.Limit > 0 {
		kv["limit"] = strconv.Itoa(f.Limit)
	}
	if f.Offset > 0 {
		kv["offset"] = strconv.Itoa(f.Offset)
	}
	var out JobsListResponse
	if err := c.do(ctx, "GET", withQuery("/v1/jobs", kv), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
