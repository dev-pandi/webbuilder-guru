package registrar

// Shapes below MUST stay aligned with registrar-api's response envelope + field
// naming. Where registrar-api hasn't finalised a reseller endpoint yet, the
// struct sits behind a "// TBD:" comment so both teams can iterate without
// silently drifting.

// --- Envelope ---

// envelope wraps single-object responses. registrar-api's global convention
// is `{"data": ...}` for success, `{"error": {...}}` for failure (handled in
// client.decodeError). Reused across all reads that return one entity.
type envelope[T any] struct {
	Data T `json:"data"`
}

// --- Domain price (existing: GET /api/global/get-domain-price/:domain) ---

// DomainPrice is the pricing snapshot for register + renew + transfer.
// All amounts are integer minor units (rupiah — no cents).
type DomainPrice struct {
	Domain   string `json:"domain"`
	TLD      string `json:"tld"`
	Currency string `json:"currency"` // "IDR", "USD"
	Register int64  `json:"register"` // per 1 year
	Renew    int64  `json:"renew"`
	Transfer int64  `json:"transfer"`
}

// --- Availability + WHOIS (existing: GET /api/global/whois?domain=...) ---

// Availability captures whether a domain can be registered. Reason is only
// set when Available=false (e.g. "reserved", "registered", "invalid_tld").
//
// Zone info opsional — registrar-api's /domain/check menyertakan info zone
// (require_document, auto_approved, dst.) yang dipakai wizard untuk decide
// apakah user perlu pilih dokumen setelah bayar.
type Availability struct {
	Domain    string    `json:"domain"`
	Available bool      `json:"available"`
	Reason    string    `json:"reason,omitempty"`
	Zone      *ZoneInfo `json:"zone,omitempty"`
}

// ZoneInfo mirrors registrar-api's zoneInfo di /domain/check response.
// Semua flag optional — kalau zone tidak ditemukan di registrar, block absent.
type ZoneInfo struct {
	Name            string `json:"name"`
	RequireDocument bool   `json:"require_document"`
	AutoApproved    bool   `json:"auto_approved"`
	NikAutoApproved bool   `json:"nik_auto_approved"`
}

// Whois is a minimal WHOIS shape for the "domain already taken" preview UI.
// If callers need the full registry record they should hit registrar-api's
// endpoint directly — this struct intentionally omits nameservers, dnssec, etc.
type Whois struct {
	Domain      string `json:"domain"`
	Status      string `json:"status"`
	Registrar   string `json:"registrar,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`   // RFC3339
	ExpiresAt   string `json:"expires_at,omitempty"`   // RFC3339
	OwnerMasked string `json:"owner_masked,omitempty"` // partial redaction for privacy
}

// --- Register domain (TBD reseller endpoint) ---
// Target endpoint spec (to be confirmed with registrar-api team):
//   POST /api/reseller/domain/register
//   Auth: Bearer <REGISTRAR_API_KEY>
//   Body: RegisterRequest
//   Success: 202 Accepted + RegisterResponse (async — payment gateway session)

// Contact mirrors the fields registrar-api needs for EPP contact object.
// Country code defaults to "ID" server-side if empty (all UMKM are Indonesian
// entities for .id TLDs).
type Contact struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"` // E.164 preferred, "+62812..."
	Address     string `json:"address"`
	City        string `json:"city"`
	State       string `json:"state"`                  // province in .id context
	PostalCode  string `json:"postal_code"`
	CountryCode string `json:"country_code,omitempty"` // ISO-3166 alpha-2
	// Nik = Nomor Induk Kependudukan (16 digit). Wajib untuk domain .id per
	// regulasi Kemenkominfo; opsional untuk TLD lain (`.com`, dst.).
	Nik string `json:"nik,omitempty"`
}

// RegisterRequest is the payload web builder POSTs to trigger a domain
// registration on behalf of a user. Registrar-api handles EPP + payment +
// document collection and later webhooks back to us with the final status.
type RegisterRequest struct {
	Domain         string   `json:"domain"`
	Years          int      `json:"years"`             // 1..10 (registrar-api validates)
	ExternalUserID string   `json:"external_user_id"`  // web builder's users.id UUID
	Contact        Contact  `json:"contact"`           // registrant + admin + tech (single contact for MVP)
	Nameservers    []string `json:"nameservers,omitempty"` // omit = registrar-api provides default hosting NS
	PaymentMethod  string   `json:"payment_method"`    // "midtrans" | "paylabs"
	// ReturnURL: where to send the user after they complete payment. Should
	// be a dashboard page that polls status (e.g. /sites/:id/domain?job=…).
	ReturnURL string `json:"return_url,omitempty"`
	// IdempotencyKey: web builder generates a UUID per checkout attempt so
	// double-clicking "Buy" doesn't double-register. Registrar-api dedupes.
	IdempotencyKey string `json:"idempotency_key"`
	// PromoCode opsional — kalau ada, registrar-api's resolvePromo helper
	// akan cari promo aktif dgn code ini + apply diskon. Kalau code tidak
	// valid, silent fallback ke harga normal (bukan error).
	PromoCode string `json:"promo_code,omitempty"`
}

// RegisterResponse is the accepted-but-pending reply. Real registration is
// async: user pays via PaymentURL, registrar-api reports back via webhook,
// caller polls RegisterStatus for interim updates.
type RegisterResponse struct {
	JobID      string `json:"job_id"`
	InvoiceID  string `json:"invoice_id,omitempty"`
	PaymentURL string `json:"payment_url,omitempty"` // Midtrans/Paylabs redirect
	Status     string `json:"status"`                // typically "pending_payment"
}

// RegisterStatus is the poll response. Status values (align with registrar-api):
//   - "pending_payment"    : waiting for user to complete payment
//   - "pending_document"   : payment done, KTP/NPWP upload pending (for .id)
//   - "pending_provisioning": all inputs OK, registrar-api is EPP-registering
//   - "active"             : domain live in registry
//   - "failed"             : terminal failure (Reason set)
//   - "expired"            : payment window elapsed
type RegisterStatus struct {
	JobID     string `json:"job_id"`
	Domain    string `json:"domain"`
	Status    string `json:"status"`
	Reason    string `json:"reason,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"` // registration expiry (RFC3339), set once Active
}

// --- Renew (existing endpoint di registrar reseller) ---
// Target: POST /v1/api/user/reseller/domain/:name/renew
// Body: RenewRequest
// Response: RegisterResponse (shape sama dengan register — job_id + payment_url)

// RenewRequest = payload minimal untuk perpanjang domain. `ExternalUserID`
// opsional; kalau di-set, registrar catat siapa end-user reseller yang trigger.
type RenewRequest struct {
	Years          int    `json:"years"`
	IdempotencyKey string `json:"idempotency_key"`
	ExternalUserID string `json:"external_user_id,omitempty"`
	PaymentMethod  string `json:"payment_method"` // "midtrans" | "paylabs"
	ReturnURL      string `json:"return_url,omitempty"`
}

// --- List domains (GET /v1/api/user/reseller/domain/list) ---

// DomainListItem mirrors registrar listItem — subset yang web builder butuh
// untuk sync/reconcile local domain_purchases cache. Field paginasi ada di
// wrapper DomainListResponse.
type DomainListItem struct {
	JobID          string `json:"job_id"`
	Domain         string `json:"domain"`
	Status         string `json:"status"`
	Kind           string `json:"kind"`
	ExternalUserID string `json:"external_user_id"`
	ExpiresAt      string `json:"expires_at,omitempty"` // RFC3339
	CreatedAt      string `json:"created_at"`
}

// DomainListResponse — response envelope untuk listing paginated. Pagination
// field sengaja `any` supaya kalau registrar tweak shape kita tidak break.
type DomainListResponse struct {
	Items      []DomainListItem `json:"items"`
	Pagination any              `json:"pagination,omitempty"`
}

// --- Reseller webhook config (GET/POST /v1/api/user/reseller/config/webhook) ---

// WebhookConfig = shape yang di-return registrar untuk config webhook.
//
// Field `Secret` hanya diisi saat POST (rotate) — GET selalu balik kosong
// karena secret write-only di registrar. Operator wajib simpan secret saat
// rotate; kalau hilang, harus rotate ulang.
type WebhookConfig struct {
	URL            string `json:"webhook_url"`
	Secret         string `json:"webhook_secret,omitempty"` // hanya di POST response
	ExternalPrefix string `json:"external_prefix,omitempty"`
}

// WebhookConfigRequest — body untuk POST /config/webhook. URL wajib absolute
// (http/https), prefix opsional (dipakai kalau registrar-side ingin insert
// path prefix di webhook target URL).
type WebhookConfigRequest struct {
	URL            string `json:"webhook_url"`
	ExternalPrefix string `json:"external_prefix,omitempty"`
}
