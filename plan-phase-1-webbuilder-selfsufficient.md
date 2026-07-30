# Plan — Fase 0 + 1: Web Builder Self-Sufficient Business Layer

Prerequisites baca dulu: [plan-saas-registrar-platform.md](plan-saas-registrar-platform.md)

**Goal**: Web builder jadi source of truth untuk semua business logic
(payment, invoice, wallet, zone catalog, PPN, dokumen). Registrar-api PANDI
tetap dipanggil untuk EPP execution VIA interface abstraction (nanti Fase 2
ganti implementation ke api-registry EPP direct).

**Timeline**: 7-8 minggu, 1-2 engineer.

**Blast radius**: Backend + admin panel + admin migrations. Frontend
reseller/agent/client mostly untouched (kecuali wizard checkout yang ada
sedikit polish).

**Reversibility**: Semua backward-compat. Kalau perlu, rollback per fase.

---

## Fase 0 — Interface abstraction (1-2 minggu)

### Task 0.1 — Definisi interface `RegistrarProvider`

File baru: `apps/api/internal/registrar/provider.go`

```go
package registrar

import (
    "context"
    "github.com/google/uuid"
)

// RegistrarProvider — abstract layer di atas registrar SDK. Implementation
// awal: PandiRegistrarAPIProvider (wrap existing Client). Nanti Fase 2:
// ApiRegistryProvider (talk ke api-registry internal via mTLS/HMAC).
type RegistrarProvider interface {
    // Domain lifecycle
    CheckDomain(ctx context.Context, domain string) (*DomainCheckResponse, error)
    RegisterDomain(ctx context.Context, req RegisterRequest) (*RegisterResponse, error)
    RenewDomain(ctx context.Context, name string, req RenewRequest) (*RegisterResponse, error)
    TransferDomain(ctx context.Context, name string, req TransferRequest) (*RegisterResponse, error)
    GetRegisterStatus(ctx context.Context, jobID string) (*RegisterStatus, error)
    RetryDomain(ctx context.Context, jobID string) (*RegisterStatus, error)
    CancelDomain(ctx context.Context, jobID string) error
    ListDomains(ctx context.Context, externalUserID string, page, perPage int) (*DomainListResponse, error)

    // Nameserver
    GetNameservers(ctx context.Context, name string) (*NameserverInfo, error)
    UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error)

    // Contact
    GetContact(ctx context.Context, contactID uint64) (*ResellerContact, error)
    UpdateContactByID(ctx context.Context, contactID uint64, payload UpdateContactPayload) (*UpdateContactResponse, error)
    UpdateDomainContact(ctx context.Context, name string, payload UpdateContactPayload) (*UpdateContactResponse, error)

    // WHOIS
    Whois(ctx context.Context, domain string) (*Whois, error)

    // Capabilities
    Capabilities() ProviderCapabilities
}

// ProviderCapabilities — cek apa yang provider support, untuk enable/disable
// endpoint di web builder secara dinamis. Provider baru mungkin tidak
// support wallet/promo/doc — feature flag di runtime.
type ProviderCapabilities struct {
    HasWallet       bool // deposit/prepaid balance
    HasPromoInternal bool // promo code registry-side
    HasDocumentFlow bool // KTP/NPWP upload flow
    HasWebhook      bool // async status callback
    HasBulkCheck    bool // batch availability
    HasTransfer     bool // transfer in/out
}
```

### Task 0.2 — Implementation `PandiRegistrarAPIProvider`

File baru: `apps/api/internal/registrar/provider_pandi.go`

Wrap existing `Client` — semua method interface delegate ke method existing.
Nol perubahan behavior.

### Task 0.3 — Wire di main.go

```go
var provider registrar.RegistrarProvider
if cfg.RegistrarAPIURL != "" {
    client := // existing client init
    provider = registrar.NewPandiRegistrarAPIProvider(client)
    slog.Info("registrar provider: pandi_api enabled")
}
// nanti Fase 2: kalau REGISTRY_MODE=api_registry → gunakan ApiRegistryProvider
```

Inject `provider` (bukan `client`) ke handler yang butuh:
- `domain_purchase.Handler`
- `wallet.Handler`
- `contactsync.Syncer`
- `pricing.Handler` (untuk `AdminListRegistrarTLDs` — bisa jadi Capabilities-guarded)

### Task 0.4 — Refactor handlers

Ubah type dari `*registrar.Client` ke `registrar.RegistrarProvider` di
semua field struct. Method call tetap sama karena interface superset.

**Effort**: ~3-5 hari (mostly find/replace + test).

### Test 0

`go vet && go build && go test ./...`. Existing test suite harus pass tanpa
perubahan. Manual smoke test: register domain via wizard, cek flow tidak
regress.

---

## Fase 1 — Business layer self-sufficient (5-6 minggu)

### Task 1.1 — Migration schema tambahan (Week 1)

File baru: `apps/api/internal/db/migrations/0035_payment_methods_settings.sql`

```sql
-- +goose Up

-- Payment methods — admin toggle per method, config JSON per provider.
CREATE TABLE IF NOT EXISTS payment_methods (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT NOT NULL UNIQUE,     -- 'midtrans' | 'paylabs' | 'manual_bank' | 'deposit_wallet'
    label        TEXT NOT NULL,            -- "Midtrans", "Transfer Bank Manual"
    type         TEXT NOT NULL,            -- 'gateway' | 'manual' | 'wallet'
    enabled      BOOLEAN NOT NULL DEFAULT false,
    config       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- credentials, bank info, dsb.
    sort_order   INT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default 4 methods (semua disabled, admin harus enable + isi credentials).
INSERT INTO payment_methods (code, label, type, enabled, sort_order) VALUES
    ('deposit_wallet', 'Wallet Prabayar', 'wallet', true, 1),
    ('midtrans', 'Midtrans (Snap)', 'gateway', false, 2),
    ('paylabs', 'Paylabs', 'gateway', false, 3),
    ('manual_bank', 'Transfer Bank Manual', 'manual', false, 4)
ON CONFLICT (code) DO NOTHING;

-- System settings — generic key-value untuk config yang perlu dinamis.
-- Key naming convention: `<namespace>.<key>` (mis. `tax.ppn_rate`).
CREATE TABLE IF NOT EXISTS system_settings (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL,       -- string (parse ke type sesuai konteks)
    description  TEXT NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default settings (bisa admin ubah nanti).
INSERT INTO system_settings (key, value, description) VALUES
    ('tax.ppn_enabled', 'true', 'Apply PPN ke invoice — set false untuk skip PPN'),
    ('tax.ppn_rate', '0.11', 'PPN rate desimal (0.11 = 11%). Ubah kalau regulasi berubah.'),
    ('tax.ppn_label', 'PPN 11%', 'Label PPN di invoice PDF'),
    ('brand.name', 'Web Builder', 'Nama brand di header + footer + invoice'),
    ('brand.support_email', 'support@example.com', 'Kontak support di invoice + email footer'),
    ('brand.support_phone', '', 'Kontak telepon support (opsional)')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS payment_methods;
```

File baru: `apps/api/internal/db/migrations/0036_zones_catalog.sql`

```sql
-- +goose Up
-- Zone catalog — admin definisi TLD apa yang di-support platform.
-- Sebelumnya di registrar-api DB; sekarang authoritative di web builder.
CREATE TABLE IF NOT EXISTS zones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tld                 TEXT NOT NULL UNIQUE,           -- 'id', 'co.id', 'com'
    label               TEXT NOT NULL,                   -- '.id', '.co.id'
    active              BOOLEAN NOT NULL DEFAULT true,
    require_document    BOOLEAN NOT NULL DEFAULT false,  -- .id family = true
    auto_approved       BOOLEAN NOT NULL DEFAULT true,   -- .id = false (admin approve)
    nik_auto_approved   BOOLEAN NOT NULL DEFAULT false,  -- .id family = true (NIK cukup)
    min_years           INT NOT NULL DEFAULT 1,
    max_years           INT NOT NULL DEFAULT 10,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Seed sample zones PANDI (admin bisa edit/hapus/tambah).
INSERT INTO zones (tld, label, require_document, auto_approved, nik_auto_approved) VALUES
    ('id',       '.id',       true,  false, true),
    ('co.id',    '.co.id',    true,  false, false),
    ('web.id',   '.web.id',   false, true,  false),
    ('biz.id',   '.biz.id',   false, true,  false),
    ('my.id',    '.my.id',    false, true,  false),
    ('or.id',    '.or.id',    true,  false, false),
    ('sch.id',   '.sch.id',   true,  false, false),
    ('ac.id',    '.ac.id',    true,  false, false),
    ('go.id',    '.go.id',    true,  false, false),
    ('desa.id',  '.desa.id',  true,  false, false)
ON CONFLICT (tld) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS zones;
```

**Note**: `platform_prices` sudah ada, extend kalau perlu char-based pricing
(2/3/4-char) sebagai extra migration di sub-task nanti.

### Task 1.2 — Backend: `system_settings` package (Week 1-2)

File baru: `apps/api/internal/settings/`

- `repo.go` — Get/Set/List key-value. In-memory cache 60s (settings jarang berubah).
- `handler.go` — admin CRUD:
  - `GET /admin/settings` — list all
  - `PATCH /admin/settings/:key` — update single value
  - Semua admin-only, audit-logged.
- `service.go` — helper accessors:
  ```go
  type Service struct { repo *Repo; cache sync.Map; ttl time.Duration }
  func (s *Service) PPNRate(ctx) float64
  func (s *Service) PPNEnabled(ctx) bool
  func (s *Service) BrandName(ctx) string
  ```
- Konsumer di package lain (invoice generator, email template, dsb.) call
  `Service` methods, bukan hard-code.

### Task 1.3 — Backend: `payment_methods` package (Week 2)

File baru: `apps/api/internal/payments/`

- `repo.go` — CRUD payment methods
- `handler.go` — admin CRUD:
  - `GET /admin/payment-methods` — list
  - `PATCH /admin/payment-methods/:id` — toggle enabled + update config
  - `POST /admin/payment-methods/:id/test` — test credentials (kalau gateway)
- Config schema per type:
  - `midtrans`: `{server_key, client_key, is_production, snap_url}`
  - `paylabs`: `{merchant_id, api_key, endpoint}`
  - `manual_bank`: `{banks: [{name, account_number, account_holder}], instructions_md}`
  - `deposit_wallet`: `{topup_min: 100000, topup_max: 100000000, methods: ['manual_bank', 'midtrans']}`
- User-facing endpoint:
  - `GET /api/v1/payment-methods` — return enabled methods dengan config minimal (tidak expose credentials). Frontend wizard render pilihan dari sini (bukan hardcoded array).

### Task 1.4 — Backend: `zones` package (Week 2-3)

File baru: `apps/api/internal/zones/`

- `repo.go` — CRUD zones
- `handler.go`:
  - Admin: `GET /admin/zones`, `POST /admin/zones`, `PATCH /admin/zones/:id`, `DELETE /admin/zones/:id`
  - Public: `GET /api/v1/zones` — return active zones untuk wizard (used by domain check).

Refactor `domain_purchase.CheckDomain` — sebelumnya `allowed_zones` dari
registrar response; sekarang cross-check dengan `zones` table local dulu.
Kalau zone tidak active di sini, jangan expose ke user (walau registrar
support). Kontrol full di operator.

### Task 1.5 — Backend: Payment gateway pluggable (Week 3-4)

File baru: `apps/api/internal/paymentgw/`

Design interface + implementasi:

```go
type Gateway interface {
    Code() string  // 'midtrans' | 'paylabs' | ...
    // CreateCharge — bikin transaksi + return payment URL (untuk gateway) atau
    // instruction (untuk manual).
    CreateCharge(ctx, req ChargeRequest) (*ChargeResponse, error)
    // HandleWebhook — verify signature + return event (success/failure).
    HandleWebhook(ctx, headers, body) (*WebhookEvent, error)
}

type ChargeRequest struct {
    OrderID     string
    Amount      int64  // IDR minor unit
    Currency    string // "IDR"
    Description string
    Customer    Customer // name, email, phone
    ReturnURL   string
}

type ChargeResponse struct {
    ProviderRefID string  // Midtrans transaction_id, dsb.
    PaymentURL    string  // gateway redirect
    ExpiresAt     time.Time
    Instructions  string  // untuk manual bank
}

type WebhookEvent struct {
    OrderID       string
    Status        string // 'paid' | 'failed' | 'expired' | 'refund'
    ProviderRefID string
    PaidAmount    int64
    PaidAt        *time.Time
    RawPayload    []byte // audit
}
```

Implement:
- `paymentgw/midtrans.go` — Snap API (sudah familiar dari registrar-api integration, port logic)
- `paymentgw/paylabs.go` — Paylabs API
- `paymentgw/manual_bank.go` — return instructions, no external call. Webhook = admin verify manual (endpoint `POST /admin/payments/:id/verify`)
- `paymentgw/registry.go` — Registry lookup by code, di-init dari `payment_methods` table.

**Impact**: sekarang saat register domain, alur payment full di web builder,
tidak lagi proxy via registrar-api.

### Task 1.6 — Backend: Invoice generator (Week 3-4)

File baru: `apps/api/internal/invoices/`

- `repo.go`:
  ```sql
  CREATE TABLE invoices (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      number        TEXT NOT NULL UNIQUE, -- 'INV-2026-07-000123'
      user_id       UUID NOT NULL REFERENCES users(id),
      purchased_by  UUID REFERENCES users(id),  -- reseller/agent kalau on-behalf
      subtotal      BIGINT NOT NULL,
      tax_rate      NUMERIC(5,4) NOT NULL,  -- capture rate at issuance
      tax_amount    BIGINT NOT NULL,
      total         BIGINT NOT NULL,        -- subtotal + tax
      currency      TEXT NOT NULL DEFAULT 'IDR',
      status        TEXT NOT NULL,          -- 'unpaid' | 'paid' | 'expired' | 'refund' | 'canceled'
      payment_method TEXT NOT NULL,          -- code dari payment_methods.code
      payment_gw_ref TEXT,                   -- Midtrans transaction_id, dsb.
      paid_at       TIMESTAMPTZ,
      due_at        TIMESTAMPTZ NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      metadata      JSONB NOT NULL DEFAULT '{}'::jsonb  -- domain, years, promo, dsb.
  );

  CREATE TABLE invoice_lines (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,   -- "Register .id — myshop.id (2 tahun)"
      quantity    INT NOT NULL DEFAULT 1,
      unit_price  BIGINT NOT NULL,
      subtotal    BIGINT NOT NULL,
      sort_order  INT NOT NULL DEFAULT 0
  );
  ```
- `service.go`:
  - `CreateForRegister(userID, domain, years, unitPrice, promoDiscount, paymentMethodCode) *Invoice` — hitung subtotal, apply PPN via settings.Service, generate number.
  - `MarkPaid(invoiceID, paidAt, providerRef)` — idempotent.
  - `GeneratePDF(invoiceID) []byte` — PDF template Indonesia (header brand, nomor invoice, alamat customer, breakdown item, PPN, total, footer support).
- `handler.go`:
  - Admin: `GET /admin/invoices`, `GET /admin/invoices/:id`, `GET /admin/invoices/:id/pdf`, `POST /admin/invoices/:id/verify` (manual bank)
  - User: `GET /invoices`, `GET /invoices/:id`, `GET /invoices/:id/pdf` (own only)
  - Reseller/agent: `GET /reseller/invoices` (aggregate — sudah ada, ganti data source ke lokal)

**Numbering scheme**: `INV-YYYY-MM-NNNNNN` (sequential per bulan). Advisory
lock untuk generate number atomic.

**PPN**: capture `tax_rate` di row saat create (bukan lookup real-time saat
render). Kalau PPN berubah later, historical invoice tetap accurate.

### Task 1.7 — Backend: Refactor purchase flow ke local business logic (Week 4-5)

Perubahan di `internal/domain_purchase/handler.go::Purchase`:

**Sebelumnya**:
1. Validate → forward ke registrar-api dengan `PromoCode`, `PaymentMethod`
2. registrar-api handle payment + invoice + EPP

**Sesudah**:
1. Validate (zone allowed via `zones` table lokal, user profile lengkap, dsb.)
2. Resolve price via `pricing.Resolve` (sudah ada)
3. Apply promo lokal (via `promo` package baru — atau tunda, delegate ke registrar Fase 2)
4. Create invoice lokal via `invoices.Service.CreateForRegister`
5. Charge via `paymentgw.Gateway.CreateCharge`
6. Return payment URL / instructions ke frontend
7. Async: setelah webhook payment confirm → trigger `provider.RegisterDomain` (EPP execution masih via provider abstraction — Fase 2 nanti pindah ke api-registry EPP direct)

**Impact ke code path**:
- Rename `Purchase` handler flow menjadi 2-phase: `create_invoice` + `execute_registration`
- Webhook receiver payment gateway → mark invoice paid → enqueue registration job
- Registration job (Asynq) → panggil provider EPP + update domain_purchases

**Wallet flow**:
- Kalau `payment_method=deposit_wallet` → langsung debit wallet + skip charge → langsung enqueue registration.
- Wallet ledger di web builder authoritative (bukan lagi mirror registrar).

### Task 1.8 — Admin UI: Settings page (Week 5)

File baru: `apps/web/app/admin/settings/page.tsx`

Tabs:
- **Umum**: PPN (enabled toggle + rate input + label), brand name, support email/phone
- **Payment Methods**: list card per method (deposit/midtrans/paylabs/manual_bank), toggle enabled, edit config modal per method
- **Zones**: table + CRUD (label, active toggle, require_document, auto_approved, nik_auto_approved, min/max years)

Reuse component pattern dari `/admin/pricing` yang sudah ada. Semua form
audit-logged (via `audit` package existing).

### Task 1.9 — Admin UI: Payment method config modals (Week 5-6)

Per method type, modal beda:
- **Midtrans**: input server_key, client_key, toggle is_production, snap URL preview
- **Paylabs**: input merchant_id, api_key, endpoint URL
- **Manual Bank**: form multi-bank (nama bank, no rekening, atas nama), rich-text instructions markdown
- **Deposit Wallet**: min/max top-up, allowed method IDs (multi-select dari yang enabled)

Kredensial di server-side encrypted at rest (pgcrypto atau app-level AES).
UI mask credentials di list view.

### Task 1.10 — Frontend wizard: dynamic payment method (Week 6)

Update `apps/web/app/sites/new-with-domain/_confirm-section.tsx`:
- Sekarang payment method hardcoded `GATEWAY_OPTIONS = [{value:'midtrans'}, {value:'paylabs'}]`
- Ganti: fetch `GET /api/v1/payment-methods` (return enabled methods) → render pilihan dari data
- Reseller/agent tetap ada opsi wallet (kalau `deposit_wallet` enabled)
- Manual bank: setelah checkout → tampilkan instruction card (bank list + jumlah + no invoice) instead of gateway redirect

### Task 1.11 — Invoice PDF template (Week 6-7)

Library: [`github.com/jung-kurt/gofpdf`](https://github.com/jung-kurt/gofpdf) atau
[`github.com/signintech/gopdf`](https://github.com/signintech/gopdf).

Template Indonesia legal-compliant:
- Header: brand logo (kalau ada) + brand name + address
- Info invoice: nomor, tanggal, jatuh tempo, status
- Info customer: nama, email, alamat lengkap, NPWP (kalau ada)
- Table item: deskripsi | qty | harga | subtotal
- Summary: subtotal, PPN (rate + amount), total
- Footer: support email/phone, "terima kasih" + brand name

Endpoint `GET /invoices/:id/pdf` return `application/pdf`, filename
`INV-YYYY-MM-NNNNNN.pdf`.

### Task 1.12 — Migration existing data (Week 7)

Script one-time:
- Untuk domain_purchases yang existing (belum punya invoice lokal), backfill:
  - Create invoice retroactive dari registrar-api ListInvoices data
  - Match by external_user_id + domain
  - Status = 'paid' kalau domain sudah active
- Cross-check: `domain_purchases.status='active'` harus punya `invoice.status='paid'`
- Report discrepancy → admin review manual

### Task 1.13 — Testing (Week 7-8)

**Unit test**:
- `settings.Service.PPNRate` — cache TTL behavior
- `invoices.Service.CreateForRegister` — PPN calculation (10, 11, 12% edge cases)
- `paymentgw.Midtrans.HandleWebhook` — signature verification
- `paymentgw.Registry` — enabled methods filter

**Integration test** (dengan `TEST_DATABASE_URL`):
- End-to-end register flow: wizard → create invoice → mock gateway webhook → registration job trigger
- Manual bank flow: create invoice → admin verify → registration trigger
- Wallet flow: debit wallet → registration trigger
- PPN change mid-flight: invoice A tetap old rate, invoice B new rate

**Manual QA checklist** di staging:
- Admin ubah PPN dari 11% → 12% → invoice baru pakai 12%, invoice existing tetap 11%
- Admin disable Midtrans → wizard hanya show Paylabs + manual bank + wallet
- Admin add zone baru `.pandi.id` → muncul di wizard search
- Reseller purchase via manual bank → admin verify → domain register

### Task 1.14 — Documentation (Week 8)

- `docs/admin-configuration.md` — cara set PPN, payment methods, zones
- `docs/deployment.md` — env vars baru, migration order
- Update `CLAUDE.md` — reflect arsitektur baru
- API changelog: endpoint baru + deprecated

---

## Deliverable checklist Fase 0+1

- [ ] Interface `RegistrarProvider` + implementasi Pandi wrapper
- [ ] Migration `payment_methods` + `system_settings` + `zones` + `invoices` + `invoice_lines`
- [ ] Package `settings` (backend + admin UI)
- [ ] Package `payments` (payment_methods CRUD)
- [ ] Package `zones` (CRUD + public list)
- [ ] Package `paymentgw` (interface + midtrans + paylabs + manual_bank)
- [ ] Package `invoices` (repo + generator + PDF)
- [ ] Refactor `domain_purchase.Purchase` → 2-phase flow (invoice + execute)
- [ ] Admin settings page (Umum + Payment Methods + Zones)
- [ ] Payment method config modals per type
- [ ] Frontend wizard: dynamic payment methods dari API
- [ ] Invoice PDF template
- [ ] Migration script existing data
- [ ] Test suite (unit + integration + manual QA)
- [ ] Documentation

## Risks & mitigation

| Risk | Mitigation |
|---|---|
| Refactor purchase flow break existing checkout | Feature flag `PAYMENT_FLOW=legacy` (via registrar-api) vs `local` (baru). Rollout gradual per zone. |
| PDF library performance | Benchmark 100 concurrent generate. Kalau lambat, generate async + cache blob. |
| Invoice number collision | Postgres advisory lock per bulan. Sequence table (`invoice_sequences`) sebagai backup. |
| Migration data loss | Backup DB sebelum jalan migration script. Dry-run mode dulu. |
| PPN calculation bug | Test dengan angka pecahan (mis. Rp 123,456 × 11%). Use int64 minor-unit throughout, hindari float. |
| Kredensial payment leak | Encrypt config JSON dengan app-level AES key (env `PAYMENT_CONFIG_KEY`). Audit log per read. |

## Success criteria Fase 1

Manual demo di staging:
1. Admin buka `/admin/settings` → ubah PPN dari 11% → 10% → simpan
2. Register domain baru → invoice pakai PPN 10%
3. Cek invoice existing → tetap PPN 11% (historical accuracy)
4. Admin toggle Midtrans off → wizard cuma show Paylabs + wallet + manual bank
5. Admin add bank BNI di manual_bank config → user checkout → instruction card muncul dengan detail BNI
6. User transfer + upload bukti → admin verify → domain register triggered
7. Full flow tanpa satu HTTP call pun ke `/api/v1/reseller/*` di registrar-api sisi purchase (verify via network log). EPP execution masih via `PandiRegistrarAPIProvider` (Fase 2 baru swap ke api-registry).

Kalau ✅ semua, ready untuk Fase 2 (api-registry EPP native).

## Effort summary

| Week | Focus |
|---|---|
| 1 | Fase 0 (interface abstraction) |
| 2 | Migration + settings + payment_methods package |
| 3 | zones + paymentgw scaffolding |
| 4 | invoices package + refactor purchase flow |
| 5 | Admin UI: Settings + payment method configs |
| 6 | Frontend wizard dynamic payment + manual bank flow |
| 7 | PDF template + data migration script |
| 8 | Testing + documentation |

**Total**: 7-8 minggu, 1-2 engineer. Kalau 2 engineer parallel, potong jadi
5-6 minggu.

Setelah Fase 1 live + stable (~2 minggu observation), lanjut Fase 2:
build api-registry EPP native.
