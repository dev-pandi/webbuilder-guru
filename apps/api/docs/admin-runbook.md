# Admin Runbook — Web Builder Self-Sufficient

Panduan operator untuk setup + monitoring + troubleshooting web builder di
mode self-sufficient (full pakai `api-registry` service, tanpa dependency
ke `registrar-api` PANDI).

---

## 1. First-Time Setup

### 1.1 Prasyarat

- Docker Compose siap (via `infra/docker-compose.yml`)
- Postgres 16 running (via compose service)
- api-registry service **wajib** running (port 5000 default)
- EPP credentials dari PANDI (`EPP_USER`, `EPP_PASSWORD`, optional cert files)

### 1.2 Env config

Edit `infra/.env`:

```bash
# --- Web builder API self-sufficient mode ---
REGISTRAR_API_URL=                        # KOSONGKAN → skip legacy proxy
REGISTRAR_API_KEY=
REGISTRAR_RESELLER_EMAIL=
REGISTRAR_RESELLER_PASSWORD=

# api-registry backend
API_REGISTRY_URL=http://api-registry:5000
API_REGISTRY_HMAC_SECRET=<32-char-min>    # generate: openssl rand -hex 32
API_REGISTRY_TIMEOUT=30s

# --- api-registry service ---
API_REGISTRY_PROVIDER_MODE=epp_direct
EPP_HOST=epp1.pandi.id
EPP_PORT=700
EPP_USER=<from-PANDI>
EPP_PASSWORD=<from-PANDI>
EPP_CERT_FILE=/etc/api-registry/epp-client.crt   # kalau PANDI kasih cert
EPP_KEY_FILE=/etc/api-registry/epp-client.key
EPP_CA_FILE=/etc/api-registry/pandi-ca.crt
```

**Verify env**: `API_REGISTRY_HMAC_SECRET` di api-registry MUST match `INTERNAL_HMAC_SECRET` di api-registry side.

### 1.3 Start services

```bash
cd infra/
docker compose up -d postgres api-registry api web renderer
docker compose logs api | grep "self-sufficient mode"
```

Harusnya muncul log:
```
registrar client: enabled  legacy_base_url=  api_registry_url=http://api-registry:5000
registrar client: self-sufficient mode — legacy registrar-api backend disabled,
                  EPP via api-registry only
```

Kalau muncul → migrasi self-sufficient sukses. Kalau tampil error
`dial tcp [::1]:3002: connect: connection refused` → env `REGISTRAR_API_URL`
belum di-kosongkan.

### 1.4 Admin bootstrap

Migration otomatis akan populate seed data (via goose):
- 11 PANDI TLD di [`zones`](../internal/db/migrations/0035_zones_catalog.sql)
- 9 system settings default (PPN 11%, brand "Web Builder") di [`system_settings`](../internal/db/migrations/0036_system_settings.sql)
- 4 payment method default (deposit_wallet enabled, midtrans/paylabs/manual_bank disabled) di [`payment_methods`](../internal/db/migrations/0037_payment_methods.sql)
- 11 retail price default di [`platform_prices`](../internal/db/migrations/0039_seed_default_prices.sql)

Buka admin panel → `/admin`. Kalau belum punya admin user, set via env:
```bash
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-strong-password
```
Restart API service — user admin otomatis dibuat/di-ensure saat startup.

### 1.5 Configure payment gateway

Login sebagai admin → `/admin/payment-methods`:

**Midtrans setup**:
1. Klik "Config" di card Midtrans
2. Isi:
   - `server_key`: dari Midtrans dashboard → Settings → Access Keys
   - `client_key`: dari Midtrans (untuk frontend)
   - `is_production`: `false` untuk sandbox, `true` untuk live
   - `snap_url`: kosongkan (auto-derive dari `is_production`)
3. Toggle "Aktifkan method ini" ✓
4. Klik "Simpan"

**Set Midtrans webhook URL** di dashboard mereka:
```
https://api.yourdomain.com/webhooks/payment/midtrans
```

**Paylabs setup**: sama pattern, dengan `merchant_id` + `api_key` dari Paylabs dashboard. Webhook URL:
```
https://api.yourdomain.com/webhooks/payment/paylabs
```

**Manual bank transfer**:
1. Klik "Config" di card Manual Bank
2. Tambah bank via tombol "+ Bank" (nama, no rekening, atas nama)
3. Isi "Instruksi tambahan" (markdown) — contoh: "Setelah transfer, upload bukti transfer di dashboard."
4. Toggle Aktif ✓

### 1.6 Verify + adjust settings

Buka `/admin/settings`:
- **PPN**: enabled + rate `0.11` (11%) + label "PPN 11%"
- **Brand**: ganti nama brand ke nama customer registrar
- **Support**: isi email support supaya muncul di footer invoice

### 1.7 Verify + adjust zones

Buka `/admin/zones`:
- 11 PANDI TLD default sudah ada
- Kalau tidak semua TLD di-support (mis. tidak jual `.desa.id`), toggle
  Active → OFF supaya tidak muncul di wizard user

### 1.8 Verify + adjust pricing

Buka `/admin/pricing`:
- 11 default retail price sudah ada
- Kalau harga PANDI berubah, klik Edit → update

### 1.9 Test end-to-end

1. Register user baru → login sebagai user
2. Buka `/sites/new-with-domain` → cari domain `.web.id` (paling murah, no doc)
3. Pilih years=1, payment_method=midtrans (kalau sudah setup sandbox)
4. Redirect ke Snap → bayar via test card
5. Kembali ke `/sites/pending/<jobId>`, tunggu ~5 detik → status jadi `active`
6. Cek `/admin/invoices` — invoice muncul dengan status "Lunas"
7. Cek WHOIS: `whois myshop.web.id` → domain register sukses ✓

---

## 2. Monitoring

### 2.1 Health checks

- `GET /healthz` — API alive
- `GET /readyz` — Postgres + api-registry connectivity
- api-registry `GET /healthz` + `/readyz` — EPP session status

### 2.2 Metrics (Prometheus text format)

`GET /metrics` — semua counter Phase 1 self-sufficient:

| Metric | Label | Meaning |
|---|---|---|
| `domain_purchase_v2_created_total` | `result`, `gateway` | PurchaseV2 checkout by outcome |
| `domain_renew_v2_created_total` | `result`, `gateway` | RenewV2 checkout by outcome |
| `payment_webhooks_total` | `code`, `result` | Webhook receiver hits |
| `domain_purchase_execute_after_payment_total` | `result`, `kind` | EPP execute trigger |
| `domain_purchases_created_total` | `kind` | Legacy purchase (fallback) |

### 2.3 Log queries

Structured log (JSON) — grep by field:

```bash
# Failed webhooks (signature invalid)
docker compose logs api | jq 'select(.msg=="payment webhook received" and .result=="invalid_signature")'

# EPP execute failures
docker compose logs api | jq 'select(.msg=="execute_after_payment: RegisterDomainDirect gagal")'

# Slow queries (>500ms)
docker compose logs api | jq 'select(.duration_ms > 500)'
```

---

## 3. Troubleshooting

### 3.1 Webhook signature failures

**Symptom**: `payment_webhooks_total{result="invalid_signature"}` counter naik

**Cause**:
- Gateway credential berubah (server_key rotate) tanpa update `/admin/payment-methods`
- Test webhook dari Postman/curl tanpa header signature yang benar

**Fix**: verify `server_key`/`api_key` di admin panel sama dengan yang di gateway dashboard. Test manual dengan tools resmi gateway (Midtrans HTTP notif tester).

### 3.2 Invoice stuck di `unpaid`

**Symptom**: user bayar tapi invoice tidak jadi `paid`

**Cause**:
- Webhook TIDAK sampai ke `/webhooks/payment/:code` (firewall, wrong URL di gateway dashboard)
- Gateway config `notify_url` tidak set di dashboard mereka

**Fix**:
1. Cek log — kalau tidak ada webhook received sama sekali, gateway TIDAK POST
2. Cek gateway dashboard: pastikan webhook URL sesuai (mis. Midtrans "Payment Notification URL")
3. Kalau webhook sudah nyampe tapi 401 signature invalid, lihat 3.1
4. Manual mark-paid via `/admin/invoices/<id>/mark-paid` (admin action, bukan webhook)

### 3.3 EPP register timeout

**Symptom**: `domain_purchase_execute_after_payment_total{result="epp_error"}` counter naik

**Cause**:
- api-registry EPP session drop / timeout
- PANDI EPP endpoint down

**Fix**:
1. Cek api-registry log: `docker compose logs api-registry | grep epp`
2. Restart api-registry supaya reconnect: `docker compose restart api-registry`
3. Invoice tetap `paid` — EPP execute bisa di-retry manual (endpoint retry belum di-expose; workaround: admin call `RegisterDomainDirect` ulang dari psql atau bikin admin endpoint)

### 3.4 Zone tidak muncul di wizard user

**Symptom**: user cari `myshop.co.id` tapi tidak muncul di hasil

**Cause**: zone `co.id` di-toggle `active=false` di `/admin/zones`

**Fix**: buka `/admin/zones` → toggle Active ON

### 3.5 Migration failed / stuck

**Symptom**: startup log `migrate: legacy import: ...`

**Cause**: goose migration blocked (biasanya karena ada custom SQL yang collide dengan seed)

**Fix**:
```bash
# Cek versi current migration
docker compose exec postgres psql -U webbuilder -d webbuilder -c "SELECT * FROM goose_db_version ORDER BY id DESC LIMIT 5;"

# Kalau perlu, rollback + retry:
docker compose exec api goose -dir /migrations postgres "$DATABASE_URL" status
docker compose exec api goose -dir /migrations postgres "$DATABASE_URL" down
```

---

## 4. Rotation / Maintenance

### 4.1 Rotate `API_REGISTRY_HMAC_SECRET`

1. Generate new secret: `openssl rand -hex 32`
2. Update env di **kedua** service:
   - `apps/api` → `API_REGISTRY_HMAC_SECRET`
   - `apps/api-registry` → `INTERNAL_HMAC_SECRET`
3. Restart both services **bersamaan**: `docker compose restart api api-registry`
4. Kalau tidak bersamaan, request antar-service akan 401 selama window rolling restart

### 4.2 Rotate payment gateway credentials

Buka `/admin/payment-methods` → Config → paste new credential → Simpan. No restart needed (fetch on-demand).

### 4.3 Backup

- Postgres: `pg_dump webbuilder > backup-$(date +%Y%m%d).sql`
- Backup HARIAN yang penting: `wallet_balances`, `wallet_ledger`, `invoices`, `invoice_lines`, `domain_purchases`, `users`
- Restore test bulanan: verify dump bisa di-restore di clean DB

### 4.4 Log retention

Rotate log di infra. Sentry (optional via `SENTRY_DSN`) untuk error tracking
long-term.

---

## 5. Deployment procedure

### 5.1 Upgrade

1. `git pull` di production repo mirror
2. `docker compose build api api-registry web`
3. Backup DB: `pg_dump ...`
4. Migration otomatis di startup (goose embedded)
5. `docker compose up -d api api-registry web renderer`
6. Verify `/healthz` semua green
7. Smoke test: register domain test user

### 5.2 Rollback

```bash
git checkout <previous-tag>
docker compose build api api-registry
# Restore DB dari backup kalau migration bermasalah
psql < backup-YYYYMMDD.sql
docker compose up -d
```

---

## 6. Contact / Escalation

- Bug produk → GitHub Issues (repo web-builder)
- EPP issue di PANDI → PANDI support ticket
- Payment gateway issue → Midtrans/Paylabs support (invoice + payment_ref sebagai bukti)

---

## Appendix — Env cheat sheet

| Env | Wajib? | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection |
| `JWT_SECRET` | ✅ | Min 32 char di production |
| `API_REGISTRY_URL` | ✅ (self-sufficient) | http://api-registry:5000 di compose |
| `API_REGISTRY_HMAC_SECRET` | ✅ (self-sufficient) | Match api-registry side |
| `REGISTRAR_API_URL` | ❌ | Kosongkan untuk self-sufficient mode |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | ✅ (first-time) | Bootstrap admin user |
| `CADDY_ASK_SECRET` | ✅ (kalau pakai Caddy) | On-demand TLS |
| `SMTP_*` | ⚠ | Kalau `MAIL_DRIVER=smtp` |
| `SENTRY_DSN` | ❌ | Optional error tracking |
