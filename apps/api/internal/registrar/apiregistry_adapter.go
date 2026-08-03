package registrar

// Adapters: route EPP-native call ke internal api-registry service (Fase 1c).
//
// Design:
//   - Setiap public method di client.go / domain.go / dsb. yang di-route
//     branch di awal: `if c.useAPIRegistry() { return c.checkDomainViaAPIRegistry(...) }`.
//   - Type translation antara webbuilder registrar types (di types.go) dan
//     apps/api-registry/client SDK types di lokal per-method helper di sini,
//     bukan di call-site — supaya call-site clean.
//   - Kalau api-registry SDK error, convert ke *APIError supaya caller
//     downstream (yang pattern-match errors.As(*APIError)) tetap works.
//
// Yang di-route:
//   check / register / renew / info / nameserver-get/update / whois / contact
//

import (
	"context"
	"errors"
	"fmt"
	"strings"

	apiregistry "github.com/webbuilder/api-registry/client"
)

// translateAPIRegistryErr — convert apiregistry.APIError → registrar.APIError
// supaya consumer pattern-match `errors.As(err, *registrar.APIError)` tetap
// works. Network error (non-APIError) di-wrap sebagai 502.
func translateAPIRegistryErr(err error) error {
	if err == nil {
		return nil
	}
	var ae *apiregistry.APIError
	if errors.As(err, &ae) {
		return &APIError{
			Status: ae.Status,
			Code:   ae.Code,
			Msg:    ae.Message,
		}
	}
	return &APIError{
		Status: 502,
		Code:   "api_registry_network",
		Msg:    fmt.Sprintf("api-registry unreachable: %v", err),
	}
}

// whoisViaAPIRegistry — route Whois ke api-registry.
//
// Convention lama: kalau domain "available" (belum registered), return
// (nil, nil) supaya caller bisa distinguish "not registered" vs error.
func (c *Client) whoisViaAPIRegistry(ctx context.Context, domain string) (*Whois, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	res, err := c.apiRegistry.Whois(ctx, domain)
	if err != nil {
		terr := translateAPIRegistryErr(err)
		var ae *APIError
		if errors.As(terr, &ae) && ae.Status == 404 {
			return nil, nil
		}
		return nil, terr
	}
	if strings.EqualFold(res.Status, "available") {
		return nil, nil
	}
	return &Whois{
		Domain:      res.Domain,
		Status:      res.Status,
		Registrar:   res.Registrar,
		CreatedAt:   res.CreatedAt,
		ExpiresAt:   res.ExpiresAt,
		OwnerMasked: res.OwnerMasked,
	}, nil
}

// getNameserversViaAPIRegistry — route GetNameservers ke api-registry.
func (c *Client) getNameserversViaAPIRegistry(ctx context.Context, name string) (*NameserverInfo, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	res, err := c.apiRegistry.GetNameservers(ctx, name)
	if err != nil {
		return nil, translateAPIRegistryErr(err)
	}
	return &NameserverInfo{Domain: res.Domain, Nameservers: res.Nameservers}, nil
}

// updateNameserversViaAPIRegistry — route UpdateNameservers ke api-registry.
// Validasi min 2 / max 13 dilakukan di api-registry side (mirror behavior).
func (c *Client) updateNameserversViaAPIRegistry(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	res, err := c.apiRegistry.UpdateNameservers(ctx, name, ns)
	if err != nil {
		return nil, translateAPIRegistryErr(err)
	}
	return &NameserverInfo{Domain: res.Domain, Nameservers: res.Nameservers}, nil
}

// RegisterDomainDirect — direct EPP register via api-registry, ZERO payment
// coupling. Dipakai flow 2-phase self-sufficient dimana web builder handle
// payment/invoice sendiri lewat paymentgw + invoices; setelah invoice paid
// (webhook), ExecuteAfterPayment panggil method ini untuk trigger EPP.
//
// Direct EPP register via api-registry. Payment concern di caller side.
//
// Requirement: `APIRegistryURL` di-set (kalau tidak, return error jelas).
func (c *Client) RegisterDomainDirect(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	if c == nil || c.apiRegistry == nil {
		return nil, &APIError{
			Status: 501,
			Code:   "api_registry_not_configured",
			Msg:    "RegisterDomainDirect butuh API_REGISTRY_URL di-set — flow 2-phase self-sufficient tidak available",
		}
	}
	if req.Domain == "" || req.Years < 1 || req.ExternalUserID == "" {
		return nil, &APIError{Status: 400, Code: "bad_request",
			Msg: "domain, years, external_user_id wajib"}
	}
	// Translate registrar.RegisterRequest → apiregistry.RegisterRequest.
	// Payment fields (payment_method, return_url, promo_code, document_ids)
	// SENGAJA tidak diteruskan — semua di web builder side sekarang.
	res, err := c.apiRegistry.RegisterDomain(ctx, apiregistry.RegisterRequest{
		Domain:         req.Domain,
		Years:          req.Years,
		ExternalUserID: req.ExternalUserID,
		IdempotencyKey: req.IdempotencyKey,
		Contact: apiregistry.Contact{
			Name:        req.Contact.Name,
			Email:       req.Contact.Email,
			Phone:       req.Contact.Phone,
			Address:     req.Contact.Address,
			City:        req.Contact.City,
			State:       req.Contact.State,
			PostalCode:  req.Contact.PostalCode,
			CountryCode: req.Contact.CountryCode,
			// Nik SENGAJA drop — api-registry sudah tidak accept per arsitektur.
		},
		Nameservers: req.Nameservers,
	})
	if err != nil {
		return nil, translateAPIRegistryErr(err)
	}
	// api-registry RegisterResponse: {JobID, Status}. Payment URL kosong
	// karena payment sudah selesai di sisi caller.
	return &RegisterResponse{
		JobID:  res.JobID,
		Status: res.Status,
	}, nil
}

// RenewDomainDirect — direct EPP renew via api-registry. Sama dengan
// RegisterDomainDirect pattern: ZERO payment coupling.
func (c *Client) RenewDomainDirect(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error) {
	if c == nil || c.apiRegistry == nil {
		return nil, &APIError{
			Status: 501,
			Code:   "api_registry_not_configured",
			Msg:    "RenewDomainDirect butuh API_REGISTRY_URL di-set",
		}
	}
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" || req.Years < 1 {
		return nil, &APIError{Status: 400, Code: "bad_request",
			Msg: "domain + years wajib"}
	}
	res, err := c.apiRegistry.RenewDomain(ctx, name, apiregistry.RenewRequest{
		Years:          req.Years,
		IdempotencyKey: req.IdempotencyKey,
		ExternalUserID: req.ExternalUserID,
	})
	if err != nil {
		return nil, translateAPIRegistryErr(err)
	}
	return &RegisterResponse{
		JobID:  res.JobID,
		Status: res.Status,
	}, nil
}

// checkDomainViaAPIRegistry — route CheckDomain ke api-registry.
//
// api-registry HTTP contract:
//   POST /v1/domains/check { "domain": "myshop.id", "external_user_id": "" }
//   -> { "data": { "query", "allowed_zones", "results": [{domain, tld, available, reason}] } }
//
// Karena api-registry sudah TIDAK expose price/zone (arsitektur SaaS), field
// tersebut nil-return dari sini. Web builder harus enrich dari platform_prices
// / zones table (fase 1 self-sufficient) — kalau perlu.
func (c *Client) checkDomainViaAPIRegistry(ctx context.Context, domain string) (*DomainCheckResponse, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	res, err := c.apiRegistry.CheckDomain(ctx, apiregistry.CheckRequest{Domain: domain})
	if err != nil {
		return nil, translateAPIRegistryErr(err)
	}
	out := &DomainCheckResponse{
		Query:        res.Query,
		AllowedZones: res.AllowedZones,
		Results:      make([]DomainCheckEntry, 0, len(res.Results)),
	}
	for _, r := range res.Results {
		out.Results = append(out.Results, DomainCheckEntry{
			Domain:    r.Domain,
			TLD:       r.TLD,
			Available: r.Available,
			Reason:    r.Reason,
			// Price + Zone silent-absent — enrich upstream oleh caller pakai
			// platform pricing table (Phase 1 self-sufficient).
		})
	}
	return out, nil
}
