# Plan — Web Builder Self-Sufficient (Status Snapshot)

> **Target**: Web builder FULL pakai `api-registry` service untuk EPP. **ZERO
> dependency** ke `registrar-api` PANDI di production build. Business logic
> (wallet, invoice, payment gateway, zone catalog, pricing, promo, dokumen)
> semua native di web builder.

Prerequisites: [plan-saas-registrar-platform.md](plan-saas-registrar-platform.md)

---

## Ringkasan Status (Snapshot)

**Fase 1 self-sufficient FUNGSIONAL COMPLETE.** Backend + Admin UI + User
Invoice UI + wallet foundation + Paylabs gateway + Docs — all done. Sisa
optional: legacy code cleanup (defer sampai frontend legacy fully migrate).

### Cara jalan mode self-sufficient sekarang

```env
# apps/api/.env
REGISTRAR_API_URL=          # kosongkan → skip legacy proxy
REGISTRAR_API_KEY=
REGISTRAR_RESELLER_EMAIL=
REGISTRAR_RESELLER_PASSWORD=

# Aktifkan api-registry
API_REGISTRY_URL=http://api-registry:5000
API_REGISTRY_HMAC_SECRET=<same as api-registry INTERNAL_HMAC_SECRET>
```

Startup log:
```
registrar client: enabled  legacy_base_url=  api_registry_url=http://api-registry:5000
registrar client: self-sufficient mode — legacy registrar-api backend disabled,
                  EPP via api-registry only
```

### Legend

- ✅ Done + verified (build + test green)
- ⏳ In progress / pending
- ⏭️ Deferred (out of Fase 1 scope)

---

## Fase Overview

| Fase | Status | Deliverable |
|---|---|---|
| **Fase 0** — Interface abstraction | ✅ | Dual-backend switch di `registrar.Client` (routing helper `UsesAPIRegistry`, method `RegisterDomainDirect`, `RenewDomainDirect`) |
| **Fase 1a** — api-registry service scaffolding | ✅ | Separate Go service, HMAC auth, jobs audit, resilience decorator, K8s manifests |
| **Fase 1b** — api-registry EPP direct | ✅ | Full EPP native via [al0fayz/epp-pandi-client](https://github.com/al0fayz/epp-pandi-client): register, renew, info, nameserver diff, contact CRUD, WHOIS TCP:43 fallback |
| **Fase 1c** — Web builder dual-backend routing | ✅ | 4 method EPP-native (Check/Whois/GetNS/UpdateNS) route ke api-registry. Register/Renew via `*Direct` variants (no payment coupling). Deferred: contact methods (lossy NicHandle translation) |
| **Fase 1** — Boundary cleanup api-registry | ✅ | Hapus NIK/document/invoice/pricing/zone/promo dari api-registry. Pure EPP-to-registry |
| **Fase 1** — Self-sufficient backend packages | ✅ | 6 packages baru di `apps/api/internal/`: `zones`, `settings`, `payment_methods` (`payments`), `paymentgw`, `invoices`, `paymentwh` |
| **Fase 1** — 2-phase checkout | ✅ | `PurchaseV2` + `RenewV2` endpoints. Flow: invoice + charge lokal → webhook → EPP execute via api-registry direct |
| **Fase 1** — Admin UI | ✅ | 4 halaman: `/admin/settings`, `/admin/zones`, `/admin/payment-methods`, `/admin/invoices` |
| **Fase 1** — User invoice UI | ✅ | `/settings/invoices-v2` (local billing) |
| **Fase 1** — Self-sufficient mode support di main.go | ✅ | `REGISTRAR_API_URL` boleh kosong; skip auto-login kalau tidak ada legacy backend |
| **Fase 1** — Wizard checkout migrate | ✅ | `/sites/new-with-domain` try V2 first + fallback legacy. Feature gate untuk wallet/on-behalf-of/promo/docs (route ke legacy) |
| **Fase 1** — Wallet integration internal (foundation) | ✅ | Package `wallet_local` — `wallet_balances` + `wallet_ledger` + atomic debit/credit + admin adjust. Migrate flow + WalletGateway integration defer ke follow-up |
| **Fase 1** — Data migration script | ✅ | `0039_seed_default_prices.sql` populate 11 PANDI TLD retail price selaras dengan zones catalog |
| **Fase 1** — Paylabs gateway impl | ✅ | `buildPaylabs` + Snap API scaffold + HMAC-SHA256 signature verify + status mapping. 9 test coverage |
| **Fase 1** — Docs | ✅ | 3 doc: [admin-runbook.md](apps/api/docs/admin-runbook.md), [user-guide.md](apps/web/docs/user-guide.md), [migration-registrar-to-api-registry.md](docs/migration-registrar-to-api-registry.md) |
| **Fase 1** — Legacy code cleanup | 🟡 partial | Deprecation banner ditambahkan di `registrar/wallet.go`, `document.go`, `invoice.go`. Full deletion defer sampai frontend legacy fully migrate. Lihat [docs/cleanup-followup.md](docs/cleanup-followup.md) untuk kondisi + urutan removal |
| **Fase 2a** — Async job runner | ⏭️ | Asynq/Redis di api-registry; swap `MemoryStore` |
| **Fase 2b** — Multi-registry | ⏭️ | Verisign (.com), CentralNic, dsb. |
| **Fase 3** — White-label deployment kit | ⏭️ | Docker Compose + Helm chart + branding config |

---

## Detail per Delivered Feature

### 1. api-registry Service — Complete

**Location**: [apps/api-registry/](apps/api-registry/)

**Provider modes** (env `API_REGISTRY_PROVIDER_MODE`):
- `pandi_wrapper` — HTTP proxy ke registrar-api PANDI (Fase 1a MVP)
- `epp_direct` — Native EPP client via al0fayz/epp-pandi-client (Fase 1b, production target)

**Endpoints** (semua behind HMAC internal auth):
- Domain: `check`, `bulk-check`, `register`, `renew`, `info`, `list`, `retry`, `cancel`, `status`
- Nameserver: `get`, `update` (add/rem diff supaya EPP tidak reject replace-all)
- Contact: `get`, `update-by-id`, `update-domain-contact`
- WHOIS: TCP:43 primary, EPP `domain:info` fallback saat network unreachable
- Jobs: audit + idempotency (in-memory MVP, target Fase 2a: Redis)

**Boundary**: NIK, document upload, invoice, pricing, zone catalog, promo — SEMUA
di web builder side. api-registry pure EPP-to-registry. Test suite verify
tidak ada field payment/promo/document/NIK di api-registry request/response.

### 2. Web Builder Backend Packages — Complete

Semua baru di `apps/api/internal/`:

| Package | Migration | Purpose |
|---|---|---|
| **[zones](apps/api/internal/zones/)** | `0035_zones_catalog.sql` | TLD catalog: active, require_document, auto_approved, nik_auto_approved, min/max years |
| **[settings](apps/api/internal/settings/)** | `0036_system_settings.sql` | Key-value config (PPN rate, brand info) dengan 60s in-memory cache + typed accessors |
| **[payments](apps/api/internal/payments/)** | `0037_payment_methods.sql` | payment_methods CRUD dengan config JSONB per type (midtrans/paylabs/manual_bank/deposit_wallet). Credential masking di list public |
| **[paymentgw](apps/api/internal/paymentgw/)** | — | Gateway interface + concrete impl Midtrans (Snap API + SHA512 webhook verify) + manual_bank (instructions markdown). Registry lookup dari `payment_methods` config |
| **[invoices](apps/api/internal/invoices/)** | `0038_invoices.sql` | State machine (draft→unpaid→paid/expired/cancelled/refund) + line items + advisory-lock sequential number generator + HTML PDF renderer (uses `settings.Service` untuk PPN + brand) |
| **[paymentwh](apps/api/internal/paymentwh/)** | — | Webhook receiver `/webhooks/payment/:code` yang dispatch ke `Gateway.HandleWebhook` + `invoices.MarkPaid` + trigger `Callback` untuk downstream EPP execute |
| **[domain_purchase](apps/api/internal/domain_purchase/)** — extended | — | `PurchaseV2` + `RenewV2` handlers (Phase A checkout: invoice + charge lokal). `ExecuteAfterPayment` callback (Phase B: EPP register/renew via `RegisterDomainDirect`) |

### 3. 2-Phase Checkout Flow — Complete

**Phase A — Checkout** (`POST /api/v1/domains/purchase/v2` atau `.../renew/v2`):
```
Frontend → PurchaseV2
  1. Validate domain + years + payment_method
  2. Fetch caller profile + zone active check
  3. pricing.GetPlatformByTLD → retail_register/renew_price
  4. invoices.CreateForRegister → invoice_id + total (with PPN via settings)
  5. gwRegistry.Get(payment_method) → Gateway
  6. Gateway.CreateCharge(order_id=invoice_id) → payment_url + provider_ref
  7. invoices.SavePaymentRef → invoice draft→unpaid
  8. Save Purchase local (status=pending_payment)
  9. Return { job_id, invoice_id, payment_url, total, due_at }
```

**Phase B — Execute** (webhook callback):
```
Provider (Midtrans) → POST /webhooks/payment/midtrans
  1. paymentwh.Receive → Gateway.HandleWebhook verify signature
  2. invoices.MarkPaid (idempotent)
  3. Callback: purchaseHandler.ExecuteAfterPayment(invoice)
     → parse metadata (kind, domain, years)
     → registrar.RegisterDomainDirect (kalau kind=register)
        atau RenewDomainDirect (kalau kind=renew)
        → api-registry.RegisterDomain / RenewDomain
        → EPP domain:create / renew
     → update Purchase.status = active
     → auto-attach Cloudflare (opsional)
```

**Metrics**:
- `domain_purchase_v2_created_total{result, gateway}`
- `domain_renew_v2_created_total{result, gateway}`
- `payment_webhooks_total{code, result}`
- `domain_purchase_execute_after_payment_total{result, kind}`

### 4. Admin UI — Complete

Nav di [apps/web/app/admin/layout.tsx](apps/web/app/admin/layout.tsx):

| Page | Path | Fungsi |
|---|---|---|
| Settings | `/admin/settings` | Grouped: Pajak (PPN enabled + rate + label) + Brand (nama/company/address/tax_id/support) |
| Zones | `/admin/zones` | CRUD TLD catalog dengan modal form (active/require_doc/auto_approve/nik_auto/years range) |
| Payment Methods | `/admin/payment-methods` | Card list + quick enable toggle + config modal per type (Midtrans server_key/client_key, Paylabs merchant_id/api_key, manual_bank multi-bank + instructions) |
| Invoices | `/admin/invoices` | Table list dengan status badge + preview PDF + mark-paid manual (untuk manual_bank verify) + cancel |

### 5. User UI — Complete (partial)

| Page | Path | Fungsi |
|---|---|---|
| Invoices (v2) | `/settings/invoices-v2` | List local invoice dengan status "Lunas"/"Belum dibayar"/dsb + link cetak PDF |

---

## Yang Belum (Fase 1 remaining)

### Task A — Wizard Checkout Migrate

**File**: `apps/web/app/sites/new-with-domain/_content.tsx`

Ganti:
```ts
const res = await api<PurchaseResp>("/api/v1/domains/purchase", {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: JSON.stringify({ domain, years, payment_method, ... }),
});
```

Jadi:
```ts
// Fetch dynamic payment methods
const pm = await api<{ items: PaymentMethod[] }>("/api/v1/payment-methods");
// Render dropdown dari pm.items (enabled only, credentials masked)

// Post ke V2
const res = await api<PurchaseV2Resp>("/api/v1/domains/purchase/v2", {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: JSON.stringify({ domain, years, payment_method, return_url }),
});
// Redirect ke res.payment_url (kalau gateway) atau show res.instructions (manual)
```

**Blockers**:
- V2 belum support wallet (butuh Task B)
- V2 belum support on-behalf-of (defer sampai wallet ready)
- V2 belum support promo (defer — bisa di-invoice metadata later)
- V2 belum support document pre-attach (defer — .id document flow butuh admin verify workflow di web builder side)

Untuk MVP: enable V2 only untuk simple flow (self-purchase + midtrans/manual_bank + no promo/docs). Legacy wizard tetap paralel untuk feature yang belum di-V2.

### Task B — Wallet Integration Internal

**Migrations**:
```sql
CREATE TABLE wallet_balances (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance       BIGINT NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL DEFAULT 'IDR',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta         BIGINT NOT NULL,       -- positive=topup/refund, negative=debit
    reason        TEXT NOT NULL,          -- 'topup'|'debit_register'|'debit_renew'|'refund'
    reference_id  UUID,                   -- invoice_id atau topup_id
    balance_after BIGINT NOT NULL,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_ledger_user_created ON wallet_ledger(user_id, created_at DESC);
```

**Package**: `apps/api/internal/wallet_local/` (avoid nama collision dengan
`wallet` legacy yang proxy ke registrar-api).

**Handler**:
- `GET /api/v1/wallet` — balance + last 20 ledger entries
- `POST /api/v1/wallet/topup` — invoice-first flow (create invoice untuk top-up, charge via gateway)
- `GET /api/v1/wallet/ledger?limit=50&page=1` — full history

**paymentgw integration**:
- New `WalletGateway` impl di [paymentgw/](apps/api/internal/paymentgw/): saat CreateCharge, langsung debit wallet + return ProviderRefID = ledger.id. HandleWebhook return ErrUnsupported (tidak ada async payment).

**PurchaseV2 integration**:
- Handler cek `payment_method == "deposit_wallet"` → skip normal gateway charge, langsung debit wallet + mark invoice paid + trigger ExecuteAfterPayment synchronous (no webhook wait).

### Task C — Data Migration Script

**Purpose**: Populate `platform_prices` + `zones` dari nilai existing yang saat
ini hardcoded/di-fetch dari registrar-api.

**Option 1 — SQL seed** (`apps/api/internal/db/migrations/0039_seed_defaults.sql`):
```sql
-- +goose Up
INSERT INTO platform_prices (tld, retail_register_price, retail_renew_price) VALUES
    ('id',      250000, 250000),
    ('co.id',   250000, 250000),
    ('web.id',  75000,  75000),
    ...
ON CONFLICT (tld) DO NOTHING;
```

**Option 2 — CLI tool** (`apps/api/cmd/seed-defaults/`):
- Read from `plan-reseller-roles.md` price catalog + `zones` seed migration
- Insert idempotent via UPSERT
- Verify count + report

Rekomendasi: Option 1 (SQL) untuk simplicity. Prices bisa di-update via
`/admin/pricing` UI setelah initial seed.

### Task D — Paylabs Gateway Impl

**File**: `apps/api/internal/paymentgw/paylabs.go` (mirror midtrans.go pattern)

- Config: `{merchant_id, api_key, endpoint}`
- CreateCharge: POST ke Paylabs `POST /invoice/create` (spec: <https://docs.paylabs.co.id>)
- HandleWebhook: HMAC-SHA256 signature verify (per Paylabs docs)
- Map status → normalized Status enum (paid/pending/failed/expired)

Effort: ~1 hari kalau credentials Paylabs sandbox available.

### Task E — Docs

**Admin Runbook** (`apps/api/docs/admin-runbook.md`):
1. First-time setup: seed prices → configure PPN → add payment gateway credentials → test purchase flow di sandbox
2. Monitoring: metrics dashboards, log queries
3. Troubleshooting: webhook signature failures, invoice stuck, EPP timeout
4. Rotation: JWT expiry (kalau still ada legacy backend), gateway credential update

**User Guide** (`apps/web/docs/user-guide.md`):
1. Cara cari + beli domain via wizard
2. Track status via `/sites/pending/[jobId]`
3. Manage nameservers + contact
4. Renew + download invoice PDF

### Task F — Legacy Code Cleanup

**Setelah Task A (wizard) + B (wallet) selesai**:

**Delete files/methods** di `apps/api/internal/registrar/`:
- `wallet.go` — semua wallet method (`GetWallet`, `InitTopup`, `UploadTopupProof`, `ListTopupBanks`, dsb.)
- `document.go` — semua document method (`ListCategories`, `UploadDocumentForJob`, `ListDocuments`, `ShowDocument`, `UploadDocument`)
- `invoice.go` — `ListInvoices` (sudah punya replacement lokal `/invoices/v2`)
- `config.go` — `GetWebhookConfig`, `SetWebhookConfig` (rotate secret via registrar-api)
- `domain.go` methods: `GetDomainPrice`, `ListRegistrarTLDs`, `CheckAvailability` (pricing di web builder sekarang)

**Delete config env** yang tidak dipakai lagi:
- `REGISTRAR_API_URL` (setelah fully migrate)
- `REGISTRAR_API_KEY`
- `REGISTRAR_RESELLER_EMAIL`
- `REGISTRAR_RESELLER_PASSWORD`
- `REGISTRAR_WEBHOOK_SECRET`

**Delete webhook receiver** `/webhooks/registrar/domain-status` (setelah wizard
migrate — legacy flow tidak lagi generate purchase via registrar-api).

**Rename `/settings/invoices-v2`** → `/settings/invoices` + delete legacy
`InvoicesList` component.

**Rename endpoint** `/api/v1/invoices/v2` → `/api/v1/invoices` (setelah legacy
`ListInvoices` removed).

Expected outcome: 100% clean, tidak ada file yang import registrar-api-specific
package. Grep `registrar-api\|registrar-api PANDI` di codebase harus zero hit.

---

## Prasyarat sebelum dijual (Success criteria pilot)

Sesuai [plan-saas-registrar-platform.md](plan-saas-registrar-platform.md)
success checklist:

1. ✅ Deploy fresh instance dari Docker Compose < 30 menit (foundation ready)
2. ✅ Admin set brand + payment methods + PPN + zones (4 admin pages complete)
3. ⏳ Register reseller account, invite agent, invite client (existing, tested)
4. ⏳ Client cari domain .id → checkout via Midtrans → EPP register sukses → domain live di WHOIS
   - Task A wizard migrate diperlukan
   - Butuh test end-to-end dengan real Midtrans sandbox + PANDI OT&E
5. ⏳ Reseller lihat wallet debit, invoice generated, PPN applied correctly
   - Task B wallet integration diperlukan
   - Invoice + PPN sudah live via `/settings/invoices-v2`
6. ✅ Full audit trail visible di admin (audit log existing)

**Status: 2/6 fully done, 4/6 partial**. Butuh Task A + Task B untuk pass full
success criteria.

---

## Rekomendasi urutan next

1. **Task C — Data migration SQL seed** (~2 jam) — small, unblocks realistic test
2. **Task A — Wizard checkout migrate** (~1-2 hari) — unlocks self-sufficient user path
3. **Task B — Wallet integration internal** (~3-5 hari) — bigger, blocks reseller/agent flow
4. **Task D — Paylabs impl** (~1 hari, kalau sandbox available)
5. **Task E — Docs** (~2 hari)
6. **Task F — Legacy cleanup** (~1 hari) — safe setelah semua above

Total estimate: **~2 minggu additional work** untuk close Fase 1 sepenuhnya.
