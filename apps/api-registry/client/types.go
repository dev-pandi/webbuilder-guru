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

type CheckEntry struct {
	Domain    string     `json:"domain"`
	TLD       string     `json:"tld"`
	Available bool       `json:"available"`
	Reason    string     `json:"reason,omitempty"`
	Price     *PriceInfo `json:"price,omitempty"`
	Zone      *ZoneInfo  `json:"zone,omitempty"`
}

type PriceInfo struct {
	Currency string  `json:"currency"`
	Register float64 `json:"register"`
	Renew    float64 `json:"renew"`
	Transfer float64 `json:"transfer"`
}

type ZoneInfo struct {
	Name            string `json:"name"`
	RequireDocument bool   `json:"require_document"`
	AutoApproved    bool   `json:"auto_approved"`
	NikAutoApproved bool   `json:"nik_auto_approved"`
}

type Contact struct {
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

type RegisterRequest struct {
	Domain         string   `json:"domain"`
	Years          int      `json:"years"`
	ExternalUserID string   `json:"external_user_id"`
	IdempotencyKey string   `json:"idempotency_key"`
	Contact        Contact  `json:"contact"`
	Nameservers    []string `json:"nameservers,omitempty"`
	DocumentIDs    []int64  `json:"document_ids,omitempty"`
}

type RegisterResponse struct {
	JobID     string `json:"job_id"`
	Status    string `json:"status"`
	InvoiceID string `json:"invoice_id,omitempty"`
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

// UploadDocumentRequest — multipart body untuk POST /v1/documents.
type UploadDocumentRequest struct {
	ExternalUserID string
	CategoryID     int64
	Filename       string
	ContentType    string
	Body           []byte
	Label          string
}

type UploadDocumentResponse struct {
	ID         int64  `json:"id"`
	Filename   string `json:"filename"`
	CategoryID int64  `json:"category_id"`
	Status     string `json:"status,omitempty"`
	CreatedAt  string `json:"created_at,omitempty"`
}

type DocumentItem struct {
	ID         int64  `json:"id"`
	Filename   string `json:"filename"`
	CategoryID int64  `json:"category_id"`
	Status     string `json:"status,omitempty"`
	CreatedAt  string `json:"created_at,omitempty"`
	Label      string `json:"label,omitempty"`
}

type DocumentsListResponse struct {
	Items []DocumentItem `json:"items"`
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
