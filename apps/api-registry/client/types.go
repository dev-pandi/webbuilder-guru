package client

import "time"

// Types mirror internal/provider types tapi tanpa dependency ke internal
// package supaya konsumer eksternal bisa import cuma module `client` tanpa
// pull seluruh api-registry codebase.
//
// Kalau kontrak berubah, sync manual di kedua tempat. Nanti bisa auto-gen
// dari OpenAPI spec.

type CheckRequest struct {
	Domain         string `json:"domain"`
	ExternalUserID string `json:"external_user_id,omitempty"`
}

type CheckResponse struct {
	Query        string       `json:"query"`
	AllowedZones []string     `json:"allowed_zones"`
	Results      []CheckEntry `json:"results"`
}

// CheckEntry — pricing/zone metadata di web builder (bukan api-registry).
type CheckEntry struct {
	Domain    string `json:"domain"`
	TLD       string `json:"tld"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// Contact — EPP contact:* object shape only. NIK/civil-ID di web builder.
type Contact struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	City        string `json:"city"`
	State       string `json:"state,omitempty"`
	PostalCode  string `json:"postal_code"`
	CountryCode string `json:"country_code,omitempty"`
}

// RegisterRequest — mirror provider.RegisterRequest. Document verification +
// invoice + payment SEMUA di web builder (bukan diteruskan ke api-registry).
type RegisterRequest struct {
	Domain         string   `json:"domain"`
	Years          int      `json:"years"`
	ExternalUserID string   `json:"external_user_id"`
	IdempotencyKey string   `json:"idempotency_key"`
	Contact        Contact  `json:"contact"`
	Nameservers    []string `json:"nameservers,omitempty"`
}

type RegisterResponse struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"`
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
	ExpiresAt string `json:"expires_at,omitempty"`
}

type BulkCheckRequest struct {
	Domains        []string `json:"domains"`
	ExternalUserID string   `json:"external_user_id,omitempty"`
}

type BulkCheckResponse struct {
	Results []CheckEntry `json:"results"`
}

type DomainListItem struct {
	JobID          string `json:"job_id"`
	Domain         string `json:"domain"`
	Status         string `json:"status"`
	Kind           string `json:"kind"`
	ExternalUserID string `json:"external_user_id"`
	ExpiresAt      string `json:"expires_at,omitempty"`
	CreatedAt      string `json:"created_at"`
}

type DomainListResponse struct {
	Items      []DomainListItem `json:"items"`
	Pagination interface{}      `json:"pagination,omitempty"`
}

type NameserverInfo struct {
	Domain      string   `json:"domain"`
	Nameservers []string `json:"nameservers"`
}

type UpdateContactRequest = Contact

type UpdateContactResponse struct {
	Domain    string `json:"domain,omitempty"`
	ContactID uint64 `json:"contact_id"`
	NicHandle string `json:"nic_handle"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Message   string `json:"message"`
}

type Whois struct {
	Domain      string `json:"domain"`
	Status      string `json:"status"`
	Registrar   string `json:"registrar,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	ExpiresAt   string `json:"expires_at,omitempty"`
	OwnerMasked string `json:"owner_masked,omitempty"`
}

type DomainInfo struct {
	Domain      string    `json:"domain"`
	Status      []string  `json:"status"`
	Registrant  string    `json:"registrant,omitempty"`
	Nameservers []string  `json:"nameservers"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// Job — subset dari internal/jobs.Job untuk consumer.
type Job struct {
	ID              string     `json:"id"`
	Kind            string     `json:"kind"`
	Status          string     `json:"status"`
	Domain          string     `json:"domain,omitempty"`
	ExternalUserID  string     `json:"external_user_id,omitempty"`
	UpstreamJobID   string     `json:"upstream_job_id,omitempty"`
	IdempotencyKey  string     `json:"idempotency_key,omitempty"`
	ErrorMessage    string     `json:"error_message,omitempty"`
	Attempts        int        `json:"attempts"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	DurationMs      int64      `json:"duration_ms,omitempty"`
}

type JobsListResponse struct {
	Items  []Job `json:"items"`
	Total  int   `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}
