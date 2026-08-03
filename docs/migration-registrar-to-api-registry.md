# Migration Checklist — registrar-api → api-registry (Self-Sufficient)

Panduan step-by-step untuk pindah deployment existing (yang pakai
`registrar-api` PANDI sebagai proxy) ke mode self-sufficient (full via
`api-registry` service).

**Target audience**: DevOps + backend engineer di customer registrar.

**Prasyarat**: sudah baca [plan-saas-registrar-platform.md](../plan-saas-registrar-platform.md) + [plan-phase-1-webbuilder-selfsufficient.md](../plan-phase-1-webbuilder-selfsufficient.md).

---

## Prasyarat

- [ ] Customer sudah PANDI-accredited (punya EPP credentials sendiri)
- [ ] `api-registry` service sudah di-deploy dan connect ke PANDI EPP (test via `/healthz`)
- [ ] Web builder existing sudah versi Phase 1 self-sufficient (backend + admin UI selesai)
- [ ] Backup Postgres HARIAN aktif (rollback plan)
- [ ] Payment gateway credentials tersedia (Midtrans/Paylabs kalau applicable)

---

## Migration Path

### Approach: gradual (recommended)

Web builder support **hybrid mode** — EPP-native call route ke api-registry
sementara wallet/document/invoice masih ke registrar-api. Frontend + backend
migrate INCREMENTAL:

| Step | Change | Rollback? |
|---|---|---|
| 0. Baseline | Legacy only (registrar-api) | — |
| 1. Enable api-registry | `API_REGISTRY_URL` set, dual-backend routing aktif | Kosongkan env |
| 2. Data seed | `platform_prices` + `zones` populated | Delete migrated rows |
| 3. Test V2 checkout | Simple flow (no wallet/promo/docs) pakai V2 | Frontend fallback ke legacy otomatis |
| 4. Enable admin panel | Set brand + PPN + payment gateway credentials | Config UI only, tidak block |
| 5. Migrate wallet | Copy balance dari registrar-api → wallet_local | Legacy wallet tetap read-only fallback |
| 6. Migrate documents | Store doc di web builder S3, verify via admin | Legacy proxy tetap available |
| 7. Cut over | `REGISTRAR_API_URL=""` — full self-sufficient | Restore env kalau perlu |
| 8. Cleanup | Hapus legacy code paths | Immutable rollback via git tag |

---

## Step-by-Step

### Step 1 — Enable api-registry (hybrid mode)

**Goal**: EPP call route ke api-registry, wallet/document/invoice tetap ke registrar-api.

- [ ] Deploy `api-registry` service (port 5000)
- [ ] Verify `/healthz` + `/readyz` GREEN
- [ ] Set env di web builder API:
  ```bash
  # KEEP existing
  REGISTRAR_API_URL=http://registrar-api.local:8080   # tetap active
  REGISTRAR_API_KEY=xxx

  # ADD new
  API_REGISTRY_URL=http://api-registry:5000
  API_REGISTRY_HMAC_SECRET=<from-api-registry-side>
  API_REGISTRY_TIMEOUT=30s
  ```
- [ ] Restart `apps/api`. Log verify:
  ```
  registrar client: EPP-native calls di-route ke api-registry (Fase 1c)
    routed: check/register/renew/nameserver/contact/whois
    unrouted: wallet/document/invoice/admin-config (tetap ke registrar-api PANDI)
  ```
- [ ] Smoke test: user cari domain via `/sites/new-with-domain` → hasil identik (backend switching invisible ke user)

**Rollback**: kosongkan `API_REGISTRY_URL` → restart → routing balik full ke registrar-api. Zero downtime.

### Step 2 — Data seed (platform_prices + zones)

**Goal**: seed default PANDI TLD + prices di web builder DB supaya PurchaseV2
punya harga sendiri (tidak fetch dari registrar-api).

- [ ] Migration otomatis via goose kalau upgrade dari version < 0039:
  - `0035_zones_catalog.sql` — 11 PANDI TLD active
  - `0039_seed_default_prices.sql` — 11 retail price default
- [ ] Verify:
  ```sql
  SELECT COUNT(*) FROM zones WHERE active = true;  -- expect 11
  SELECT COUNT(*) FROM platform_prices;             -- expect >= 11
  ```
- [ ] Buka `/admin/zones` — 11 TLD muncul dengan default rules
- [ ] Buka `/admin/pricing` — 11 retail price muncul
- [ ] **PENTING**: adjust price kalau customer punya rate berbeda dari default seed. Default seed berdasarkan PANDI 2024 pricing.

**Rollback**: `DELETE FROM platform_prices WHERE tld IN (...)` — cuma hapus yang matching default value (`Down` migration selective).

### Step 3 — Configure admin panel

**Goal**: brand + PPN + payment gateway setup.

- [ ] Buka `/admin/settings`:
  - Ubah `brand.name` ke nama customer
  - Ubah `brand.company_name` + `brand.company_address` + `brand.tax_id`
  - Set `tax.ppn_rate` sesuai regulasi (default 0.11 = 11%)
  - Isi `brand.support_email` + `brand.support_phone`
- [ ] Buka `/admin/payment-methods`:
  - **Midtrans**: paste `server_key` + `client_key`. Set `is_production=true` di production
  - **Paylabs**: paste `merchant_id` + `api_key`
  - **Manual Bank**: tambah 1-3 bank + instructions markdown
  - Toggle Aktif untuk method yang mau di-expose ke user
- [ ] Set webhook URL di dashboard gateway:
  - Midtrans: `https://api.<yourdomain>.com/webhooks/payment/midtrans`
  - Paylabs: `https://api.<yourdomain>.com/webhooks/payment/paylabs`

### Step 4 — Test V2 checkout end-to-end

**Goal**: verify PurchaseV2 flow bekerja untuk simple flow.

- [ ] Register user test baru
- [ ] Login → `/sites/new-with-domain`
- [ ] Cari domain `.web.id` (paling murah, no doc required)
- [ ] Pilih years=1, payment_method=**Midtrans** (sandbox mode)
- [ ] Klik "Beli" → redirect ke Snap → bayar dengan test card `4811 1111 1111 1114`
- [ ] Kembali ke `/sites/pending/<jobId>` — status jadi `active` dalam 5-10 detik
- [ ] `/admin/invoices` — invoice muncul dengan status **Lunas**
- [ ] `whois <domain>.web.id` — domain live di registry ✓

**Kalau V2 gagal**: check `/metrics` untuk `domain_purchase_v2_created_total{result="charge_failed"}`
atau `execute_after_payment_total{result="epp_error"}`. Frontend akan
fallback ke legacy `/purchase` (silent) — user tidak notice, tapi request
route ke registrar-api lagi.

### Step 5 — Migrate wallet balance (kalau customer punya user existing)

**Goal**: copy balance user dari registrar-api ke `wallet_balances` lokal.

- [ ] Query registrar-api DB (atau via API) untuk export balance:
  ```sql
  -- Di registrar-api side (Postgres):
  \COPY (SELECT external_user_id, balance FROM reseller_wallets) TO '/tmp/wallets.csv' CSV;
  ```
- [ ] Import ke web builder DB:
  ```sql
  -- Sementara di web builder side, load CSV:
  CREATE TEMP TABLE wallet_import (user_id TEXT, balance BIGINT);
  \COPY wallet_import FROM '/tmp/wallets.csv' CSV;

  -- Insert ke wallet_balances + ledger entry as migration reason:
  INSERT INTO wallet_balances (user_id, balance)
  SELECT user_id::uuid, balance FROM wallet_import
  ON CONFLICT DO NOTHING;

  INSERT INTO wallet_ledger (user_id, delta, reason, balance_after, metadata)
  SELECT user_id::uuid, balance, 'admin_adjust', balance,
         jsonb_build_object('note', 'Migration from registrar-api',
                            'migrated_at', now())
  FROM wallet_import
  WHERE balance > 0;
  ```
- [ ] Verify: `SELECT SUM(balance) FROM wallet_balances;` → total = sum di registrar-api
- [ ] User: `/settings/wallet-v2` → balance muncul dengan history entry "admin_adjust" as migration marker

### Step 6 — Migrate documents

Documents (KTP, NPWP) sekarang di web builder side (per arsitektur).

**Kalau customer belum banyak document di registrar-api**:
- [ ] Skip — user upload ulang saat next register (workflow: upload dulu, admin verify)

**Kalau ada banyak document existing**:
- [ ] Export document metadata + files dari registrar-api storage (S3/MinIO)
- [ ] Setup `apps/api/internal/documents_local/` (belum di-implement, PR terpisah)
- [ ] Copy files ke web builder S3/MinIO
- [ ] Insert metadata ke `documents_local` table
- [ ] Existing register flow yang butuh document tetap OK karena web builder tidak forward `document_ids` ke api-registry di V2 flow

**Note**: Migration document mode ini defer. Kalau customer mau launch cepat, restart document verify from scratch (user upload ulang) — acceptable karena document flow jarang.

### Step 7 — Cut over: full self-sufficient

**Goal**: hapus dependency ke registrar-api sepenuhnya.

- [ ] Verify metrics selama 1-2 minggu operasi hybrid tidak ada error signifikan
- [ ] Verify wallet balance konsisten (`SELECT SUM(balance) ...` sama di kedua source)
- [ ] Verify tidak ada pending job/invoice di legacy flow (all `paid` atau `expired`)
- [ ] Update env:
  ```bash
  REGISTRAR_API_URL=              # kosongkan
  REGISTRAR_API_KEY=
  REGISTRAR_RESELLER_EMAIL=
  REGISTRAR_RESELLER_PASSWORD=
  REGISTRAR_WEBHOOK_SECRET=

  # api-registry tetap:
  API_REGISTRY_URL=http://api-registry:5000
  API_REGISTRY_HMAC_SECRET=xxx
  ```
- [ ] Restart `apps/api`. Log verify:
  ```
  registrar client: self-sufficient mode — legacy registrar-api backend disabled,
                    EPP via api-registry only
  ```
- [ ] Shutdown `registrar-api` service (kalau di-manage di infra yang sama)
- [ ] Smoke test end-to-end ulang

**Rollback (kalau perlu)**: restore env `REGISTRAR_API_URL` + restart. Legacy proxy jalan lagi.

### Step 8 — Legacy code cleanup

**Goal**: hapus code paths yang tidak dipakai lagi.

**Do this only after Step 7 stable > 2 minggu.**

- [ ] Delete files di `apps/api/internal/registrar/`:
  - `wallet.go`, `document.go`, `invoice.go`, `config.go`
  - Method `GetDomainPrice`, `ListRegistrarTLDs`, `CheckAvailability` di `domain.go`
- [ ] Delete legacy handler routes di `router/user.go`:
  - `/domains/purchase` (legacy) — cukup keep `/domains/purchase/v2`
  - `/reseller/wallet/*` — legacy proxy, replace with `/wallet/v2`
  - `/domains/*/documents` — replace dengan local document endpoint
  - `/webhooks/registrar/*` — legacy webhook receiver
- [ ] Rename `/invoices/v2` → `/invoices` (canonical) + delete legacy `ListInvoices` di `domain_purchase/handler.go`
- [ ] Rename `/wallet/v2` → `/wallet` (canonical) + delete legacy `wallet.Handler`
- [ ] Frontend: `/settings/invoices-v2` → `/settings/invoices`; `/settings/wallet-v2` → `/settings/wallet`
- [ ] Delete env keys di `.env.example`: `REGISTRAR_*`
- [ ] Delete registrar-api compose service kalau di-manage di same repo
- [ ] Commit + tag: `v2.0.0-self-sufficient`

---

## Rollback Emergency

Kalau di production tiba-tiba semua flow break:

1. **Stop bleeding**: restore env `REGISTRAR_API_URL` + `REGISTRAR_API_KEY` di web builder API
2. Restart `apps/api` — legacy proxy aktif lagi (asumsi registrar-api masih running)
3. Kalau registrar-api sudah di-shutdown, start ulang: `docker compose up -d registrar-api`
4. Investigate root cause di `api-registry` logs + `/metrics`
5. Fix + retry migration dari step failure

---

## Verification checklist (final)

Sesudah Step 7 + Step 8, verify:

- [ ] `docker compose ps` — `registrar-api` container **tidak ada** (kalau at-repo)
- [ ] `docker compose logs api | grep "registrar-api"` — zero hit
- [ ] `grep -r "registrar-api PANDI" apps/api/` — zero hit di code
- [ ] `apps/api/internal/registrar/wallet.go` — file tidak ada
- [ ] `apps/api/internal/registrar/document.go` — file tidak ada
- [ ] `curl -s http://api.local/metrics | grep registrar_jwt_reauth_total` — counter = 0 (no legacy JWT refresh)
- [ ] User beli domain → EPP register sukses via api-registry (verify di api-registry logs)
- [ ] Admin `/admin/invoices` — semua invoice recent dari `PurchaseV2` shape (bukan legacy)

Kalau semua ✓ → migration **complete**. Produk siap dipasarkan sebagai
"zero PANDI dependency" ke pilot customer.

---

## Contact

Untuk pertanyaan spesifik migration:
- Product architecture: baca [plan-saas-registrar-platform.md](../plan-saas-registrar-platform.md)
- Implementation detail per Fase: baca [plan-phase-1-webbuilder-selfsufficient.md](../plan-phase-1-webbuilder-selfsufficient.md)
- Admin operations: baca [apps/api/docs/admin-runbook.md](../apps/api/docs/admin-runbook.md)
- User-facing flow: baca [apps/web/docs/user-guide.md](../apps/web/docs/user-guide.md)
