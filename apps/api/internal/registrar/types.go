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

// --- Reseller check (POST /v1/api/user/reseller/domain/check) ---

// DomainCheckResponse — envelope response dari reseller check. Registrar batch
// EPP query untuk 1..N zone dan return semua di `Results`. `AllowedZones`
// = daftar TLD yang reseller boleh handle; UI pakai ini untuk hint sebelum
// user mulai search (mis. show sebagai chips).
type DomainCheckResponse struct {
	Query        string             `json:"query"`
	AllowedZones []string           `json:"allowed_zones"`
	Results      []DomainCheckEntry `json:"results"`
}

// DomainCheckEntry — 1 domain hasil check. Price + Zone opsional (silent-absent
// kalau product/zone belum di-config di registrar untuk kombinasi tsb).
type DomainCheckEntry struct {
	Domain    string          `json:"domain"`
	TLD       string          `json:"tld"`
	Available bool            `json:"available"`
	Reason    string          `json:"reason,omitempty"`
	Price     *PriceInfo      `json:"price,omitempty"`
	Zone      *ZoneInfo       `json:"zone,omitempty"`
}

// PriceInfo mirrors registrar's price block (float64 currency amounts). Beda
// dengan `DomainPrice` yang pakai int64 minor units — kita jaga fidelity
// float64 di boundary registrar API supaya tidak lose precision kalau nanti
// harga bukan bilangan bulat.
type PriceInfo struct {
	Currency string  `json:"currency"`
	Register float64 `json:"register"`
	Renew    float64 `json:"renew"`
	Transfer float64 `json:"transfer"`
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
	// DocumentIDs = ID dokumen dari registrar (hasil POST /reseller/documents
	// dengan tag external_user_id sama). Kalau zone butuh dokumen dan array
	// non-empty, registrar auto-attach → job skip pending_document, langsung
	// ke pending_provisioning. Kosong = flow post-payment (user upload nanti
	// via POST /register/:job_id/documents).
	DocumentIDs []uint64 `json:"document_ids,omitempty"`
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
	// PromoCode opsional — registrar cari promo aktif dengan applies_to=renew.
	// Kalau invalid/expired/rule mismatch → silent fallback ke harga normal
	// (bukan error). Konsisten dengan register flow.
	PromoCode string `json:"promo_code,omitempty"`
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

// --- Reseller invoices (GET /v1/api/user/reseller/invoices) ---

// Invoice = 1 baris invoice yang di-link ke reseller_domain_jobs milik reseller
// yang login. Registrar sudah strip billing address (privacy) — kita tidak
// pernah ekspos data itu ke UI. Jobs[] = 1..N job yang share invoice ini
// (umumnya 1:1 dengan register atau renew).
type Invoice struct {
	ID              uint64        `json:"id"`
	UUID            string        `json:"uuid"`
	InvoiceNumber   string        `json:"invoice_number"`
	TotalPrice      float64       `json:"total_price"`
	Status          string        `json:"status"` // "Unpaid" | "On Check" | "Paid" | "Canceled" | "Expired" | "Refund" | "Rejected"
	DueDate         string        `json:"due_date"`
	TransactionDate string        `json:"transaction_date,omitempty"`
	CreatedAt       string        `json:"created_at"`
	Jobs            []InvoiceJob  `json:"jobs"`
}

// InvoiceJob = ringkasan job yang link ke invoice ini. Sudah cukup untuk render
// row: user tahu domain + jenis (register/renew) tanpa second-fetch.
type InvoiceJob struct {
	JobID          string `json:"job_id"`
	Domain         string `json:"domain"`
	Kind           string `json:"kind"`   // "register" | "renew"
	Years          int    `json:"years"`
	Status         string `json:"status"` // job status di registrar
	ExternalUserID string `json:"external_user_id,omitempty"`
}

// InvoiceListResponse — envelope paginated dari GET /reseller/invoices.
type InvoiceListResponse struct {
	Items      []Invoice `json:"items"`
	Pagination any       `json:"pagination,omitempty"`
}

// --- Reseller document library (GET/POST /v1/api/user/reseller/documents) ---

// Document = 1 baris dokumen di registrar's document library, di-tag ke
// external_user_id (= web builder users.id UUID) supaya tidak mix antar
// end-user. Web builder NEVER simpan file — hanya cache ID + metadata untuk
// picker UI. `DocURL` bisa jadi absolute atau relative path dari registrar.
type Document struct {
	ID             uint64 `json:"id"`
	Name           string `json:"name"`
	CategoryID     uint64 `json:"category_id"`
	CategoryName   string `json:"category_name,omitempty"`
	DocURL         string `json:"doc_url"`
	ExternalUserID string `json:"external_user_id,omitempty"`
	CreatedAt      string `json:"created_at"`
}

// DocumentListResponse — response paginated dari GET /reseller/documents.
// `Pagination` any supaya kalau registrar tweak shape tidak break.
type DocumentListResponse struct {
	Items      []Document `json:"items"`
	Pagination any        `json:"pagination,omitempty"`
}

// DocumentPreview — response dari GET /reseller/documents/:id.
// `Image` sudah dalam data URI (`data:image/jpeg;base64,...`) siap di-render.
// `Type` = MIME asli (image/jpeg, image/png, application/pdf).
type DocumentPreview struct {
	ID    uint64 `json:"id"`
	Type  string `json:"type"`
	Image string `json:"image"`
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

// --- Wallet (Phase 3.5+) ---

// Wallet = shape dari GET /reseller/wallet. Balance dalam major units (IDR).
// RecentLedger = 20 entry terakhir supaya dashboard punya preview tanpa
// second-fetch ke ledger endpoint.
type Wallet struct {
	Balance      float64             `json:"balance"`
	Currency     string              `json:"currency"`
	RecentLedger []WalletLedgerEntry `json:"recent_ledger"`
}

// WalletLedgerEntry = 1 baris ledger reseller. Kind enum:
//   - topup                — credit dari top-up sukses
//   - debit_register       — debit saat register domain
//   - debit_renew          — debit saat renew domain
//   - credit_refund_epp    — refund otomatis kalau EPP fail
//   - credit_refund_admin  — refund manual admin
//   - debit_admin          — debit manual admin (correction)
type WalletLedgerEntry struct {
	ID            uint64  `json:"id"`
	Kind          string  `json:"kind"`
	Amount        float64 `json:"amount"`
	BalanceAfter  float64 `json:"balance_after"`
	ReferenceType string  `json:"reference_type,omitempty"`
	ReferenceID   int64   `json:"reference_id,omitempty"`
	Description   string  `json:"description,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

// WalletLedgerListResponse — paginated ledger. `Pagination` shape any supaya
// tahan drift kalau registrar tweak field.
type WalletLedgerListResponse struct {
	Items      []WalletLedgerEntry `json:"items"`
	Pagination any                 `json:"pagination,omitempty"`
}

// TopupRequest — body POST /reseller/wallet/topup. `PaymentMethod` salah satu
// {midtrans, paylabs, manual_transfer}. `BankID` hanya relevan untuk
// manual_transfer (opsional, kalau kosong registrar pakai default bank).
type TopupRequest struct {
	Amount         float64 `json:"amount"`
	PaymentMethod  string  `json:"payment_method"`
	IdempotencyKey string  `json:"idempotency_key"`
	ReturnURL      string  `json:"return_url,omitempty"`
	BankID         uint64  `json:"bank_id,omitempty"`
}

// TopupResponse — response POST /wallet/topup. `PaymentURL` di-set untuk
// gateway flow (midtrans/paylabs). `BankInstructions` non-nil untuk
// manual_transfer flow (reseller pakai instruksi ini untuk transfer).
type TopupResponse struct {
	TopupID          string            `json:"topup_id"`
	InvoiceID        string            `json:"invoice_id,omitempty"`
	Amount           float64           `json:"amount"`
	PaymentMethod    string            `json:"payment_method"`
	PaymentURL       string            `json:"payment_url,omitempty"`
	Status           string            `json:"status"`
	BankInstructions *BankInstructions `json:"bank_instructions,omitempty"`
}

// BankInstructions — instruksi transfer manual (mode manual_transfer).
// ReferenceCode WAJIB dipakai reseller di berita transfer supaya admin match.
type BankInstructions struct {
	BankID        uint64 `json:"bank_id,omitempty"`
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
	Branch        string `json:"branch,omitempty"`
	ReferenceCode string `json:"reference_code"`
	Note          string `json:"note,omitempty"`
}

// TopupStatus — response GET /wallet/topup/:id/status.
// Status values: pending_payment, awaiting_proof, pending_verification,
// credited, failed, expired, rejected.
type TopupStatus struct {
	TopupID       string  `json:"topup_id"`
	Amount        float64 `json:"amount"`
	Status        string  `json:"status"`
	PaymentMethod string  `json:"payment_method"`
	PaymentURL    string  `json:"payment_url,omitempty"`
	Reason        string  `json:"reason,omitempty"`
	CreditedAt    string  `json:"credited_at,omitempty"`
}

// TopupListItem — 1 row dari GET /wallet/topup?status=... . Superset dari
// TopupStatus + timestamp created + expires (untuk gateway flow).
type TopupListItem struct {
	TopupID       string  `json:"topup_id"`
	Amount        float64 `json:"amount"`
	Status        string  `json:"status"`
	PaymentMethod string  `json:"payment_method"`
	PaymentURL    string  `json:"payment_url,omitempty"`
	Reason        string  `json:"reason,omitempty"`
	CreatedAt     string  `json:"created_at"`
	CreditedAt    string  `json:"credited_at,omitempty"`
	ExpiresAt     string  `json:"expires_at,omitempty"`
}

// TopupListResponse — paginated. Registrar tidak wrap `items` di envelope
// tambahan; shape sudah top-level di response body-data.
type TopupListResponse struct {
	Items      []TopupListItem `json:"items"`
	Pagination any             `json:"pagination,omitempty"`
}

// TopupBank — 1 rekening tujuan (untuk manual_transfer picker).
type TopupBank struct {
	ID            uint64 `json:"id"`
	BankName      string `json:"bank_name"`
	BankCode      string `json:"bank_code,omitempty"`
	AccountNumber string `json:"account_number"`
	AccountHolder string `json:"account_holder"`
	Branch        string `json:"branch,omitempty"`
	Notes         string `json:"notes,omitempty"`
}
