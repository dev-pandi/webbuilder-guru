# Cleanup Follow-up — Legacy Code Removal

Setelah Fase 1 self-sufficient fungsional complete, ada legacy code paths
yang masih ada untuk **backward compat + gradual migration**. Delete step-
by-step setelah frontend fully migrate.

**Guiding principle**: jangan delete code selama masih ada 1 consumer
(frontend / handler / test) yang panggil. Fungsi legacy tetap aman —
kalau `REGISTRAR_API_URL=""` (self-sufficient mode), call ke method
legacy akan return "not configured" error, bukan panic.

---

## Prasyarat Sebelum Delete

Untuk setiap file / method di bawah, verify **ZERO consumer** dulu:

```bash
# Grep pemakaian di codebase (exclude test file, exclude deleted target):
grep -rn "registrar\.<MethodName>" apps/ --include="*.go" | grep -v _test.go

# Frontend consumer:
grep -rn "/reseller/wallet\|/api/v1/invoices\b\|/domains/purchase\b" apps/web/ apps/renderer/
```

Kalau grep hit non-zero → **jangan delete**, migrate consumer dulu.

---

## Removal Checklist

### Group 1 — Wallet (blocked by frontend)

**Legacy files**:
- [ ] `apps/api/internal/registrar/wallet.go` — proxy ke registrar-api wallet
- [ ] `apps/api/internal/wallet/handler.go` — HTTP handler yang panggil client wallet

**Consumers to migrate first**:
- [ ] Frontend `/reseller/wallet` page → panggil `/api/v1/wallet/v2` (local)
- [ ] Frontend `/agent/wallet` page → panggil `/api/v1/wallet/v2`
- [ ] Legacy topup UI (`InitTopup`, `UploadProof`) → migrate ke wallet_local topup flow (belum ada, butuh `apps/api/internal/wallet_local/topup.go` follow-up)

**Delete steps** (setelah semua consumer migrated):
1. Delete `apps/api/internal/registrar/wallet.go`
2. Delete `apps/api/internal/wallet/handler.go` (renamed dari legacy → hapus, gunakan wallet_local)
3. Update `main.go` — hapus `walletHandler` construction + `deps.Wallet` field
4. Update router — hapus `/reseller/wallet/*` + `/agent/wallet/*` routes
5. Frontend rename `/wallet/v2` → `/wallet` (canonical path)

### Group 2 — Document (blocked by document workflow)

**Legacy files**:
- [ ] `apps/api/internal/registrar/document.go` — proxy ke registrar-api document endpoints
- [ ] `apps/api/internal/documents/` handler yang panggil client document (kalau ada — cek)

**Blocker**: `apps/api/internal/documents_local/` **belum ada**. Perlu buat dulu:
- [ ] Migration `documents` table di web builder DB
- [ ] Storage integration ke S3/MinIO (sudah ada `assets.Storage` interface — reuse)
- [ ] Admin verify workflow — endpoint approve/reject
- [ ] Frontend document upload di `/sites/pending/[jobId]` migrate ke endpoint local

**Delete steps** (setelah documents_local ready):
1. Delete `apps/api/internal/registrar/document.go`
2. Update `domain_purchase/handler.go` — hapus `AttachDocument`, `ListDocuments`, `ShowDocument`
3. Update router — hapus `/domains/purchases/:job_id/documents` legacy path
4. Rename local endpoint → canonical `/documents`

### Group 3 — Invoice (blocked by frontend legacy InvoicesList)

**Legacy files**:
- [ ] `apps/api/internal/registrar/invoice.go` — proxy ke registrar-api ListInvoices
- [ ] `domain_purchase/handler.go::ListInvoices` — legacy handler

**Consumers to migrate first**:
- [ ] Frontend `/settings/invoices` (legacy `InvoicesList` component) → migrate shape ke local invoice (dari `/settings/invoices-v2` port pattern)
- [ ] Frontend `/reseller/invoices` aggregate — belum ada di local, butuh implement

**Delete steps** (setelah frontend migrated):
1. Delete `apps/api/internal/registrar/invoice.go`
2. Delete `ListInvoices` method di `domain_purchase/handler.go`
3. Update router — hapus `/api/v1/invoices` legacy route
4. Rename `/invoices/v2` → `/invoices` (canonical)
5. Frontend rename `/settings/invoices-v2` → `/settings/invoices`

### Group 4 — Registrar-side pricing (blocked by admin sync UI)

**Legacy methods di `apps/api/internal/registrar/domain.go`**:
- [ ] `GetDomainPrice`
- [ ] `ListRegistrarTLDs`
- [ ] `CheckAvailability`

**Consumers to migrate first**:
- [ ] Admin `/admin/pricing/registrar-tlds` sync page — pricing catalog di web builder sudah lokal (`platform_prices`), sync dari registrar-api tidak lagi relevan
- [ ] Wizard "cek availability" call — sudah pakai `CheckDomain` route

**Delete steps**:
1. Delete 3 method dari `domain.go`
2. Update `pricing/handler.go` — hapus `AdminListRegistrarTLDs`, `SetRegistrar` receiver (no longer needed karena tidak fetch remote)
3. Frontend `/admin/pricing` — hapus tab "Sync from registrar"

### Group 5 — Admin webhook config

**Legacy files**:
- [ ] `apps/api/internal/registrar/config.go` — `GetWebhookConfig`, `SetWebhookConfig` (rotate webhook secret via registrar-api)
- [ ] `domain_purchase/handler.go::AdminGetWebhookConfig`, `AdminSetWebhookConfig`

**Consumers to migrate first**:
- [ ] Frontend `/admin/registrar` webhook config tab

**Delete steps**:
1. Delete `apps/api/internal/registrar/config.go`
2. Hapus 2 admin handler dari `domain_purchase`
3. Frontend `/admin/registrar` — hapus tab webhook (jadi cuma "Domain Purchases" tab)

### Group 6 — Legacy Purchase / Renew handler

**Legacy handlers**:
- [ ] `domain_purchase.Handler.Purchase` (POST /domains/purchase legacy)
- [ ] `domain_purchase.Handler.Renew` (POST /domains/renew legacy)

**Consumers**:
- [ ] Frontend `/sites/new-with-domain` wizard — sudah try V2 first + fallback legacy. Kalau wallet/on-behalf-of/promo/docs required, tetap fallback ke legacy.

**Delete steps** (setelah wallet_local + document_local + promo migrate):
1. Delete `Purchase`, `Renew` method dari `handler.go`
2. Update router — hapus `POST /domains/purchase`, `POST /domains/renew`
3. Rename `POST /domains/purchase/v2` → `POST /domains/purchase`
4. Rename `POST /domains/:name/renew/v2` → `POST /domains/:name/renew`
5. Frontend — hapus fallback path, direct call ke canonical endpoint

### Group 7 — Legacy webhook receiver

**Legacy file**:
- [ ] `domain_purchase.Handler.Webhook` at `/webhooks/registrar/domain-status`

**Consumer**: registrar-api PANDI POST kesini. Setelah cut-over (`REGISTRAR_API_URL=""`), tidak ada source lagi.

**Delete steps**:
1. Delete `Webhook` method
2. Update router `global.go` — hapus route `/webhooks/registrar/domain-status`
3. Update main.go — `webhookSecret` config option bisa ikut dihapus

### Group 8 — Env variables

Setelah semua di atas cleanup:

- [ ] Hapus `REGISTRAR_API_URL`, `REGISTRAR_API_KEY`, `REGISTRAR_API_TIMEOUT` dari:
  - `apps/api/.env.example`
  - `apps/api/internal/config/config.go`
  - `infra/.env.example`
  - `infra/docker-compose.yml`
- [ ] Hapus `REGISTRAR_RESELLER_EMAIL`, `REGISTRAR_RESELLER_PASSWORD`
- [ ] Hapus `REGISTRAR_WEBHOOK_SECRET`
- [ ] Hapus `SetCredentials`, `SetAPIKey`, auto-login block di main.go
- [ ] Hapus `HasLegacyBackend()` predicate + `useAPIRegistry()` conditional
  (semua call sekarang default via api-registry)

### Group 9 — Rename package back to canonical

- [ ] `wallet_local` → `wallet` (setelah legacy `wallet` package dihapus)
- [ ] `/settings/invoices-v2` → `/settings/invoices` (setelah legacy InvoicesList dihapus)
- [ ] `/api/v1/invoices/v2` → `/api/v1/invoices`
- [ ] `/api/v1/domains/purchase/v2` → `/api/v1/domains/purchase`
- [ ] `/api/v1/domains/:name/renew/v2` → `/api/v1/domains/:name/renew`
- [ ] `/api/v1/wallet/v2` → `/api/v1/wallet`

Version bump: tag `v2.0.0-clean` di git.

---

## Verification (final "zero legacy dependency")

Sesudah semua group di atas cleanup:

```bash
# Verify zero registrar-api PANDI reference di code (kecuali di doc):
grep -rn "registrar-api PANDI\|registrar_api\|proxy ke registrar" \
    apps/api/ apps/web/ apps/renderer/ --include="*.go" --include="*.ts" --include="*.tsx" \
    | grep -v docs/ | grep -v _test.go

# Expect: 0 hit

# Verify env cleanup:
grep -rn "REGISTRAR_API\|REGISTRAR_RESELLER\|REGISTRAR_WEBHOOK" \
    apps/api/ infra/ --include="*.env.example" --include="*.yml" --include="*.go"

# Expect: 0 hit
```

Kalau semua 0 → produk sudah **fully self-sufficient**. Bisa di-release
sebagai major version `v2.0.0`.

---

## Risk Mitigation

**Rollback strategy**: setiap group cleanup harus di git tag terpisah supaya
kalau ternyata masih ada consumer yang miss, bisa cherry-pick revert.

**Test coverage**: setelah cleanup, run:
```bash
cd apps/api && go test -race -count=1 -timeout 180s ./...
cd apps/web && npm run typecheck && npm run build
```

Kalau ada test failure → belum siap delete, ada consumer yang miss di
audit.

**Metric monitoring**: setelah cleanup deploy, monitor 1-2 minggu:
- `payment_webhooks_total` — verify normal
- `domain_purchase_v2_created_total` — verify traffic pindah dari legacy
- 5xx error rate — verify tidak spike

Kalau error spike, rollback tag terakhir. Investigate → fix → retry.
