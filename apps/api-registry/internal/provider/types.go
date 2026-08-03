// Package provider — abstract EPP registrar operations di belakang interface.
// MVP: PandiWrapperProvider (proxy ke registrar-api PANDI). Fase 2 nanti:
// EPPDirectProvider (talk EPP TCP+TLS langsung ke registry).
//
// Konsumer (handler layer) depend ke interface, bukan concrete type — mirror
// pola web builder API supaya swap implementation zero-touch di caller.
package provider

import (
	"context"
	"time"
)

// Capabilities — feature flags per provider. Runtime cek supaya handler bisa
// return 501 Not Implemented untuk fitur yang provider ini tidak support
// (mis. `deposit_wallet` cuma ada di PANDI wrapper legacy, tidak di EPP direct).
//
// Documents/invoice/wallet/promo/zone/pricing SEMUA di web builder side per
// arsitektur SaaS — bukan concern api-registry. Field di sini reflect
// dukungan EPP-native saja.
type Capabilities struct {
	HasWallet        bool // legacy deposit/prepaid balance (pandi_wrapper only)
	HasBulkCheck     bool // 1 request check banyak domain
	HasTransfer      bool // transfer in/out
	HasDNSSEC        bool // DS record management
	HasPromoInternal bool // legacy promo code (pandi_wrapper only)
	HasContact       bool // contact create/update/info via EPP
}

// Provider — kontrak inti. Semua method context-aware + return typed error.
type Provider interface {
	Name() string
	Capabilities() Capabilities

	// --- Domain lifecycle ---
	CheckDomain(ctx context.Context, req CheckRequest) (*CheckResponse, error)
	BulkCheckDomains(ctx context.Context, req BulkCheckRequest) (*BulkCheckResponse, error)
	RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error)
	RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error)
	GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error)
	RetryRegister(ctx context.Context, jobID string) (*RegisterStatus, error)
	CancelRegister(ctx context.Context, jobID string) error
	InfoDomain(ctx context.Context, name string) (*DomainInfo, error)
	ListDomains(ctx context.Context, f ListDomainsFilter) (*DomainListResponse, error)

	// --- Nameserver ---
	GetNameservers(ctx context.Context, name string) (*NameserverInfo, error)
	UpdateNameservers(ctx context.Context, name string, nameservers []string) (*NameserverInfo, error)

	// --- Contact (WHOIS-visible identity) ---
	GetContact(ctx context.Context, contactID uint64) (*Contact, error)
	UpdateContactByID(ctx context.Context, contactID uint64, req UpdateContactRequest) (*UpdateContactResponse, error)
	UpdateDomainContact(ctx context.Context, name string, req UpdateContactRequest) (*UpdateContactResponse, error)

	// --- WHOIS proxy ---
	Whois(ctx context.Context, domain string) (*Whois, error)
}

// --- Request/response types ---

// CheckRequest — domain (SLD only atau full FQDN). SLD-only akan expand ke
// semua allowed_zones oleh provider (kalau support).
type CheckRequest struct {
	Domain         string `json:"domain"`
	ExternalUserID string `json:"external_user_id,omitempty"` // opsional untuk tracing
}

type CheckResponse struct {
	Query        string       `json:"query"`
	AllowedZones []string     `json:"allowed_zones"`
	Results      []CheckEntry `json:"results"`
}

// CheckEntry — hasil check per-domain dari EPP domain:check. Pricing +
// zone metadata (require_document / auto_approved / nik) TIDAK di sini
// per arsitektur: itu urusan web builder yang tahu zone catalog + harga.
type CheckEntry struct {
	Domain    string `json:"domain"`
	TLD       string `json:"tld"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// RegisterRequest — payload untuk domain register. Document verification
// (KTP/NPWP untuk .id) di web builder — tidak diteruskan ke api-registry.
// Invoice + payment juga di web builder.
type RegisterRequest struct {
	Domain         string      `json:"domain"`
	Years          int         `json:"years"`
	ExternalUserID string      `json:"external_user_id"`
	IdempotencyKey string      `json:"idempotency_key"`
	Contact        Contact     `json:"contact"`
	Nameservers    []string    `json:"nameservers,omitempty"` // opsional; default registry NS
	Metadata       interface{} `json:"metadata,omitempty"`    // pass-through untuk tracing
}

type RegisterResponse struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"` // 'accepted' | 'pending_provisioning' | 'active' | 'failed'
}

type RenewRequest struct {
	Years          int    `json:"years"`
	IdempotencyKey string `json:"idempotency_key"`
	ExternalUserID string `json:"external_user_id,omitempty"`
}

type RegisterStatus struct {
	JobID     string `json:"job_id"`
	Domain    string `json:"domain"`
	Status    string `json:"status"`
	Reason    string `json:"reason,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"` // RFC3339
}

// DomainInfo — hasil query domain state di registry.
type DomainInfo struct {
	Domain      string    `json:"domain"`
	Status      []string  `json:"status"` // EPP statuses (ok, clientHold, dsb.)
	Registrant  string    `json:"registrant,omitempty"` // NIC handle
	Nameservers []string  `json:"nameservers"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// NameserverInfo — response GET/UPDATE nameserver.
type NameserverInfo struct {
	Domain      string   `json:"domain"`
	Nameservers []string `json:"nameservers"`
}

// Contact — identity registrant/admin/tech/billing. Mirror EPP contact:*
// object shape. NIK / civil ID / document data BUKAN di sini — itu PII
// user yang di-owned web builder (verify via document flow di sana).
type Contact struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	City        string `json:"city"`
	State       string `json:"state,omitempty"`
	PostalCode  string `json:"postal_code"`
	CountryCode string `json:"country_code,omitempty"` // default "ID"
}

type UpdateContactRequest = Contact

type UpdateContactResponse struct {
	Domain    string `json:"domain,omitempty"` // set kalau via UpdateDomainContact
	ContactID uint64 `json:"contact_id"`
	NicHandle string `json:"nic_handle"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Message   string `json:"message"` // 3 varian: DB+EPP / DB only / drift
}

// --- BulkCheck ---

// BulkCheckRequest — batch multi-domain check. Bagus untuk wizard yang
// tampilkan sekaligus availability dari list domain candidate (mis. AI
// suggestion, alternative TLD suggestion). Provider yang tidak support
// batch fallback ke loop CheckDomain per entry.
type BulkCheckRequest struct {
	Domains        []string `json:"domains"` // full FQDN list
	ExternalUserID string   `json:"external_user_id,omitempty"`
}

// BulkCheckResponse — hasil per input domain. Urutan match input order.
type BulkCheckResponse struct {
	Results []CheckEntry `json:"results"`
}

// --- ListDomains ---

// DomainListItem — 1 row hasil list. Subset field yang web builder butuh
// untuk sync/reconcile local cache. Field pagination di wrapper response.
type DomainListItem struct {
	JobID          string `json:"job_id"`
	Domain         string `json:"domain"`
	Status         string `json:"status"`
	Kind           string `json:"kind"`
	ExternalUserID string `json:"external_user_id"`
	ExpiresAt      string `json:"expires_at,omitempty"` // RFC3339
	CreatedAt      string `json:"created_at"`
}

// DomainListResponse — envelope untuk paginated response. Pagination field
// dari upstream provider — untuk MVP pass-through raw supaya konsumer bisa
// paginate tanpa hardcode shape.
type DomainListResponse struct {
	Items      []DomainListItem `json:"items"`
	Pagination interface{}      `json:"pagination,omitempty"`
}

// ListDomainsFilter — query params. ExternalUserID biasanya wajib supaya
// scope by end-user; caller boleh kosongkan kalau butuh full list (admin).
type ListDomainsFilter struct {
	ExternalUserID string
	Page           int
	PerPage        int
}

// Whois — minimal shape untuk display "domain taken" info.
type Whois struct {
	Domain      string `json:"domain"`
	Status      string `json:"status"`
	Registrar   string `json:"registrar,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	ExpiresAt   string `json:"expires_at,omitempty"`
	OwnerMasked string `json:"owner_masked,omitempty"`
}
