package registrar

// Types di-share antara client + api-registry adapter + konsumer di
// domain_purchase. Phase 3 self-sufficient: shape yang tersisa hanya untuk
// EPP-native flow (check/register/renew/nameserver/whois) yang route lewat
// api-registry. Wallet/document/invoice/topup dulu di sini sudah dihapus —
// pindah ke package-package lokal (wallet_local, invoices, documents_local).

// --- WHOIS ---

// Whois — minimal shape untuk preview "domain already taken". Full record
// hidden — caller yang butuh detail lain harus fetch dari sumber lain.
type Whois struct {
	Domain      string `json:"domain"`
	Status      string `json:"status"`
	Registrar   string `json:"registrar,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`   // RFC3339
	ExpiresAt   string `json:"expires_at,omitempty"`   // RFC3339
	OwnerMasked string `json:"owner_masked,omitempty"` // partial redaction untuk privacy
}

// --- Domain check ---

// ZoneInfo — flag zone dari check response, dipakai wizard untuk decide
// UI (kalau require_document true, tampilkan doc picker).
type ZoneInfo struct {
	Name            string `json:"name"`
	RequireDocument bool   `json:"require_document"`
	AutoApproved    bool   `json:"auto_approved"`
	NikAutoApproved bool   `json:"nik_auto_approved"`
}

// PriceInfo — harga dari check response (float64 dari api-registry, akan
// di-round ke int64 minor unit di web builder side).
type PriceInfo struct {
	Currency string  `json:"currency"`
	Register float64 `json:"register"`
	Renew    float64 `json:"renew"`
	Transfer float64 `json:"transfer"`
}

// DomainCheckResponse — envelope hasil check via api-registry.
type DomainCheckResponse struct {
	Query        string             `json:"query"`
	AllowedZones []string           `json:"allowed_zones"`
	Results      []DomainCheckEntry `json:"results"`
}

// DomainCheckEntry — 1 domain hasil check. Price + Zone opsional
// (api-registry biasanya tidak return, enrich upstream oleh caller).
type DomainCheckEntry struct {
	Domain    string     `json:"domain"`
	TLD       string     `json:"tld"`
	Available bool       `json:"available"`
	Reason    string     `json:"reason,omitempty"`
	Price     *PriceInfo `json:"price,omitempty"`
	Zone      *ZoneInfo  `json:"zone,omitempty"`
}

// --- Register + Renew (EPP-native, no payment coupling) ---

// Contact — EPP contact object. NIK opsional per zone.
type Contact struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"` // E.164 preferred
	Address     string `json:"address"`
	City        string `json:"city"`
	State       string `json:"state"`
	PostalCode  string `json:"postal_code"`
	CountryCode string `json:"country_code,omitempty"` // ISO-3166 alpha-2
	Nik         string `json:"nik,omitempty"`
}

// RegisterRequest — payload untuk RegisterDomainDirect. Payment fields
// TIDAK termasuk (payment sudah selesai di web builder side sebelum call).
type RegisterRequest struct {
	Domain         string   `json:"domain"`
	Years          int      `json:"years"`
	ExternalUserID string   `json:"external_user_id"`
	Contact        Contact  `json:"contact"`
	Nameservers    []string `json:"nameservers,omitempty"`
	IdempotencyKey string   `json:"idempotency_key"`
}

// RegisterResponse — response minimal dari api-registry.
type RegisterResponse struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"`
}

// RenewRequest — payload untuk RenewDomainDirect. Payment-agnostic.
type RenewRequest struct {
	Years          int    `json:"years"`
	IdempotencyKey string `json:"idempotency_key"`
	ExternalUserID string `json:"external_user_id,omitempty"`
}
