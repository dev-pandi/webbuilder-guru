package registrar

import (
	"context"
	"net/url"
	"strconv"
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

// CheckDomain hits the reseller check endpoint:
//
//	POST /v1/api/user/reseller/domain/check
//	body: {"domain": "myshop"}         → SLD-only, multi-zone check
//	body: {"domain": "myshop.co.id"}   → single-zone check
//
// Registrar batch-check via EPP (1 round-trip) dan return envelope dengan:
//   - query        : input asli (post-trim/lower)
//   - allowed_zones: TLD yang reseller boleh handle — dipakai UI hint
//   - results      : per-domain entry (available, reason, price, zone flags)
//
// Wajib reseller auth (Bearer). `Price`/`Zone` per entry silent-absent kalau
// tidak ter-config (bukan error).
func (c *Client) CheckDomain(ctx context.Context, domain string) (*DomainCheckResponse, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[DomainCheckResponse]
	body := map[string]string{"domain": domain}
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/domain/check", body, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// RegistrarTLD — 1 entri list TLD yang reseller boleh handle + harga awal
// dari registrar. Currency dan flag zone (require_document, auto_approved)
// disertakan supaya admin bisa langsung decide markup dan surface hint.
type RegistrarTLD struct {
	TLD             string  `json:"tld"`
	Currency        string  `json:"currency"`
	Register        float64 `json:"register"`
	Renew           float64 `json:"renew"`
	Transfer        float64 `json:"transfer"`
	RequireDocument bool    `json:"require_document"`
	AutoApproved    bool    `json:"auto_approved"`
	NikAutoApproved bool    `json:"nik_auto_approved"`
}

// ListRegistrarTLDs mengembalikan daftar zone yang reseller boleh handle
// plus harga wholesale awal dari registrar. Implementasi memanggil endpoint
// check dengan placeholder SLD — registrar batch EPP check untuk semua
// allowed zones (1 round-trip). Availability SLD-nya di-abaikan; kita hanya
// pakai `AllowedZones` + `Results[*].Price` + `Results[*].Zone`.
//
// Placeholder SLD `webbuilder-tld-probe` sengaja panjang & nonsensical
// supaya tidak akan bentrok dengan domain user; kalau ternyata "tersedia"
// di EPP kita ignore. Method ini dipanggil admin manual dari halaman
// pricing — 1 EPP round-trip acceptable.
func (c *Client) ListRegistrarTLDs(ctx context.Context) ([]RegistrarTLD, error) {
	res, err := c.CheckDomain(ctx, "webbuilder-tld-probe")
	if err != nil {
		return nil, err
	}
	byTLD := make(map[string]*DomainCheckEntry, len(res.Results))
	for i := range res.Results {
		r := &res.Results[i]
		byTLD[strings.ToLower(r.TLD)] = r
	}
	out := make([]RegistrarTLD, 0, len(res.AllowedZones))
	for _, z := range res.AllowedZones {
		z = strings.ToLower(strings.TrimSpace(z))
		if z == "" {
			continue
		}
		row := RegistrarTLD{TLD: z, Currency: "IDR"}
		if entry, ok := byTLD[z]; ok {
			if entry.Price != nil {
				if entry.Price.Currency != "" {
					row.Currency = entry.Price.Currency
				}
				row.Register = entry.Price.Register
				row.Renew = entry.Price.Renew
				row.Transfer = entry.Price.Transfer
			}
			if entry.Zone != nil {
				row.RequireDocument = entry.Zone.RequireDocument
				row.AutoApproved = entry.Zone.AutoApproved
				row.NikAutoApproved = entry.Zone.NikAutoApproved
			}
		}
		out = append(out, row)
	}
	return out, nil
}

// CheckAvailability = semantic wrapper untuk single-domain query (input WAJIB
// full FQDN). Return entry pertama dari results (registrar guarantee 1 entry
// untuk single-zone input). Kalau reseller call gagal (401/5xx), fallback ke
// public Whois — better than blocking user.
func (c *Client) CheckAvailability(ctx context.Context, domain string) (*Availability, error) {
	res, err := c.CheckDomain(ctx, domain)
	if err == nil && len(res.Results) > 0 {
		r := &res.Results[0]
		return &Availability{
			Domain:    r.Domain,
			Available: r.Available,
			Reason:    r.Reason,
			Zone:      r.Zone,
		}, nil
	}
	// Fallback via public Whois — return availability sinyal minimal tanpa
	// harga/zone. Kalau Whois juga gagal, propagate error asli dari reseller.
	w, wErr := c.Whois(ctx, domain)
	if wErr != nil {
		if err != nil {
			return nil, err
		}
		return nil, wErr
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

// ListDomains — fetch semua job milik reseller, opsional filter per end-user.
//
//	GET /v1/api/user/reseller/domain/list?external_user_id=<uuid>&page=&perPage=
//
// Dipakai reconcile flow: tarik ground truth dari registrar → update cache
// lokal (`domain_purchases`) yang mungkin drift karena webhook missed. Kita
// selalu pass externalUserID supaya registrar cuma balikin milik user tsb;
// reseller-scope isolation sudah di-handle registrar (RequireReseller).
func (c *Client) ListDomains(ctx context.Context, externalUserID string, page, perPage int) (*DomainListResponse, error) {
	q := url.Values{}
	if externalUserID != "" {
		q.Set("external_user_id", externalUserID)
	}
	if page > 0 {
		q.Set("page", strconv.Itoa(page))
	}
	if perPage > 0 {
		q.Set("perPage", strconv.Itoa(perPage))
	}
	path := "/v1/api/user/reseller/domain/list"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var env envelope[DomainListResponse]
	if err := c.do(ctx, "GET", path, nil, &env); err != nil {
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

// UpdateContactPayload — full replace payload untuk PATCH
// /reseller/domain/:name/contact. Registrar treat sebagai contact:update EPP
// yang REPLACE semua field (bukan partial). Caller wajib merge dari state
// lama sebelum submit — kalau tidak, field yang tidak dikirim akan wipe.
//
// Nik wajib non-empty untuk zone .id (registrar reject 400 kalau kosong).
// CountryCode default "ID" di server-side kalau kosong.
type UpdateContactPayload struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	City        string `json:"city"`
	State       string `json:"state,omitempty"`
	PostalCode  string `json:"postal_code"`
	CountryCode string `json:"country_code,omitempty"`
	Nik         string `json:"nik,omitempty"`
}

// UpdateContactResponse — envelope response. `Message` punya 3 varian
// (lihat plan §14.10) — caller yang butuh UX banner bisa string-match
// substring "DB + EPP registry" / "DB only" / "drift".
type UpdateContactResponse struct {
	Domain    string `json:"domain"`
	ContactID uint64 `json:"contact_id"`
	NicHandle string `json:"nic_handle"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Message   string `json:"message"`
}

// GetResellerContact — GET /v1/api/user/reseller/contacts/:id.
// Detail contact untuk pre-fill form update. `is_provisioned` flag di
// response bisa dipakai UI untuk warning kalau contact belum di-registry.
type ResellerContact struct {
	ID            uint64 `json:"id"`
	NicHandle     string `json:"nic_handle"`
	Name          string `json:"name"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	Address       string `json:"address"`
	City          string `json:"city"`
	State         string `json:"state,omitempty"`
	PostalCode    string `json:"postal_code"`
	CountryID     uint64 `json:"country_id"`
	IsProvisioned bool   `json:"is_provisioned"`
}

func (c *Client) GetResellerContact(ctx context.Context, contactID uint64) (*ResellerContact, error) {
	if contactID == 0 {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "contact_id kosong"}
	}
	var env envelope[ResellerContact]
	path := "/v1/api/user/reseller/contacts/" + strconv.FormatUint(contactID, 10)
	if err := c.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// UpdateResellerContactByID — PATCH /v1/api/user/reseller/contacts/:id.
// Direct contact update via contact_id. Efficient (1 call untuk semua
// domain yang share contact) dan tidak butuh domain aktif. Behavior
// identik dengan domain-scoped variant untuk semua state (registry
// synced / DB-only / drift). NIK TIDAK ter-update di sini — NIK per-domain
// di `domains.user_nik`.
func (c *Client) UpdateResellerContactByID(ctx context.Context, contactID uint64, payload UpdateContactPayload) (*UpdateContactResponse, error) {
	if contactID == 0 {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "contact_id kosong"}
	}
	var env envelope[UpdateContactResponse]
	path := "/v1/api/user/reseller/contacts/" + strconv.FormatUint(contactID, 10)
	if err := c.do(ctx, "PATCH", path, payload, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// UpdateResellerDomainContact — PATCH /reseller/domain/:name/contact.
// Sync contact info end-user ke registry EPP + DB registrar. Semua field
// di payload WAJIB (registry replace-all). Ownership enforced di registrar
// (404 kalau bukan milik reseller yang login).
//
// Return 3 varian sukses berdasarkan state contact di registry — semua
// 200 OK, beda hanya `Message`.
func (c *Client) UpdateResellerDomainContact(ctx context.Context, name string, payload UpdateContactPayload) (*UpdateContactResponse, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "domain kosong"}
	}
	var env envelope[UpdateContactResponse]
	if err := c.do(ctx, "PATCH", "/v1/api/user/reseller/domain/"+url.PathEscape(name)+"/contact", payload, &env); err != nil {
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
