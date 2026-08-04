# Flow: User Beli Domain → Pilih Template → Cloudflare → Domain Live

End-to-end flow user membeli domain, memilih template situs, auto-attach Cloudflare, sampai domain bisa diakses public. Berlaku untuk **client** (self-purchase) — reseller/agent flow ada di [flow-reseller-register-domain.md](flow-reseller-register-domain.md).

**Actor:** User authenticated (role apapun — client / reseller / agent) yang beli domain untuk dirinya sendiri.

---

## 1. Pre-conditions

- [x] User sudah login (JWT valid, email_verified_at != null)
- [x] Profil user lengkap: `name`, `phone_number`, `address`, `city`, `postal_code` (semua wajib untuk EPP contact). Tambahan `nik` wajib untuk zone `.id`.
- [x] `API_REGISTRY_URL` + `API_REGISTRY_HMAC_SECRET` di-set di [apps/api](apps/api) config → registrar client aktif
- [x] Minimum 1 zone active di tabel `zones` (mis. `.id`, `.co.id`, `.com`) — cek `/admin/zones`
- [x] Minimum 1 payment method enabled di `payment_methods` — cek `/admin/payment-methods`
- [x] Kalau pakai wallet: `role != client` (deposit_wallet reseller/agent-only), saldo cukup
- [x] (Optional) Cloudflare config di `cloudflare_configs` → auto-attach jalan post-register

---

## 2. Sequence diagram (happy path — wallet payment, sync)

```
User Browser        Web-Builder API      api-registry       PANDI EPP         Cloudflare        Renderer
    │                    │                    │                  │                  │                │
    │── GET /domains/check ────────────────→ │                  │                  │                │
    │                    │─ POST /v1/domains/check ────────────→ │                  │                │
    │                    │                    │─ domain:check ─→ │                  │                │
    │                    │                    │←── available ─── │                  │                │
    │                    │←── available + zones ──────────────── │                  │                │
    │←── available:true, price=Rp 200k ─────│                  │                  │                │
    │                    │                    │                  │                  │                │
    │── POST /domains/purchase (deposit_wallet) ───────────────→ │                  │                │
    │                    │─ ✓ profil complete, ✓ zone active, ✓ wallet cukup       │                │
    │                    │─ CreateInvoice (kind=register) ─      │                  │                │
    │                    │─ WalletGateway.CreateCharge → DEBIT wallet, insert ledger │              │
    │                    │─ MarkPaid(invoice) — inline           │                  │                │
    │                    │─ ExecuteAfterPayment ─                │                  │                │
    │                    │  └ RegisterDomainDirect ────────────→ │                  │                │
    │                    │                    │─ contact:create → │                  │                │
    │                    │                    │─ domain:create ─→ │                  │                │
    │                    │                    │←── job_id="epp_… " │                  │                │
    │                    │                    │─ domain:info ───→ │  (fetch fresh)   │                │
    │                    │                    │←── expDate,       │                  │                │
    │                    │                    │    registrant     │                  │                │
    │                    │←── {job_id, active} ───────────────── │                  │                │
    │                    │─ UpsertDomain (registered_domains) — cache expires_at, contact_id         │
    │                    │─ tryAttachToCloudflare (best-effort) ─────────────────→ │                │
    │                    │                    │                  │  ─ CreateZone → NS + zone_id      │
    │                    │                    │                  │  ─ CreateA record @ → PLATFORM_IP │
    │                    │                    │                  │  ─ CreateCNAME www → root         │
    │                    │                    │                  │←─ NS assignment                   │
    │                    │─ UpdateNameservers (push CF NS to registry) ──────────→ │                │
    │                    │                    │─ domain:update NS → │                  │                │
    │                    │← ✓ synchronous provisioning done       │                  │                │
    │←── 202 Accepted {job_id, status:active} │                  │                  │                │
    │                    │                    │                  │                  │                │
    │── redirect /sites/pending/[job_id] ────                    │                  │                │
    │── polling /domains/purchases/[job_id] every 2-5s ────────→ │                  │                │
    │←── {status:"active", site_id:null} ────                    │                  │                │
    │                    │                    │                  │                  │                │
    │── render TemplatePicker (5 category × 3 variant = 15 built-in)                                 │
    │── klik "Preview" template → open iframe /template-preview/:slug ───────────────────────────→  │
    │                    │                    │                  │                  │   render page │
    │← user pilih template + nama situs                          │                  │                │
    │── POST /sites/from-template/:slug {name, job_id} ────────→│                  │                │
    │                    │─ Validate purchase ownership          │                  │                │
    │                    │─ Load template.pages_json + theme_json                    │                │
    │                    │─ INSERT sites (user_id, name, slug, theme snapshot)       │                │
    │                    │─ INSERT pages (from template)         │                  │                │
    │                    │─ AttachSite (purchase.site_id = new site.id)              │                │
    │                    │─ AttachDomainSite (registered_domains.site_id = site.id)  │                │
    │                    │←─ site_id                             │                  │                │
    │←── 201 {id, slug} ────────────────────                     │                  │                │
    │                    │                    │                  │                  │                │
    │── redirect /sites/[id]/editor         (user edit isi situs)                                    │
    │                    │                    │                  │                  │                │
    │── DNS propagate 1-60min (Cloudflare hosts + NS di PANDI updated)                              │
    │                    │                    │                  │                  │                │
    │── someone visits https://myshop.id ─────────────────────────────────────────────────────────→ │
    │                    │                    │                  │                  │   Host lookup │
    │                    │←── GET /public/site-by-host?host=myshop.id ────────────────────────────  │
    │                    │─ SELECT * FROM domains WHERE hostname='myshop.id'         │                │
    │                    │  (auto row post-attach via renderer hostname mapping)     │                │
    │                    │→ site_id + pages                                          │                │
    │                    │                    │                  │                  │   render HTML │
    │←── HTML ✓ ─────────────────────────────────────────────────────────────────────────────────── │
```

---

## 3. Detailed step-by-step

### 3.1 Cek domain + pilih (wizard)

**UI**: `/sites/new-with-domain` — 3-step wizard.

1. **Search input** (`_search-section.tsx`) — user ketik SLD (mis. `myshop`) atau FQDN (`myshop.id`).
2. **API call**: `POST /api/v1/domains/check` dengan `{domain: "myshop"}`.
3. **Backend logic** ([domain_purchase/handler.go](apps/api/internal/domain_purchase/handler.go) `Check` → `checkDomain`):
   - Kalau SLD (no dot) → fetch active zones dari `zones.ListActive`, fan-out N goroutine parallel: `registrar.CheckDomain("myshop.id")`, `"myshop.co.id"`, dst.
   - Kalau FQDN → single call ke api-registry.
   - Aggregate + filter zone yang `active=false` di local catalog.
4. **api-registry side** ([epp/domain.go](apps/api-registry/internal/epp/domain.go) `CheckDomain`) → EPP `domain:check` frame → PANDI response → parse `available` flag per domain.
5. **Response frontend**: list per TLD dengan status available + price (dari `platform_prices` local, enriched by web builder).
6. **User pick**: klik salah satu row available → wizard step 2 (confirm).

### 3.2 Confirm + submit purchase

**UI**: `_confirm-section.tsx`.

1. **Profile check** — kalau field wajib kosong, tombol "Beli" disabled + link ke `/settings/profile`.
2. **Payment method picker** — hasil dari `GET /api/v1/payment-methods` (enabled only). Untuk client: hide `deposit_wallet`. Untuk reseller/agent: wallet muncul dengan balance preview.
3. **Optional**: promo code, upload dokumen KTP kalau zone butuh (`.id` require_document).
4. **Idempotency**: `useMemo` generate UUID → dipakai sebagai `Idempotency-Key` header. Cegah double submit.
5. **API call**: `POST /api/v1/domains/purchase` dengan:
   ```json
   {
     "domain": "myshop.id",
     "years": 1,
     "payment_method": "deposit_wallet",
     "return_url": "https://app.example.com/checkout/return",
     "promo_code": "PROMO25"
   }
   ```

### 3.3 Backend purchase handler

[purchase.go](apps/api/internal/domain_purchase/purchase.go) — semua dalam 1 request:

1. **Validasi** — years 1-10, payment_method not empty, Idempotency-Key required.
2. **Profile complete check** — return 400 kalau ada field missing.
3. **Wallet payment guard** — client role ditolak (`IsResellerLike(caller.Role)` check).
4. **Zone check** — `require_document` → butuh `document_ids[]` atau `nik`.
5. **Promo validate** (kalau ada) — `promos.Validate(code, tld, subtotal)` → dapat discount.
6. **CreateInvoice** — `invoicesSvc.CreateForRegister(...)` → row `invoices` dengan metadata `{domain, years, kind:register, job_id}`.
7. **Redeem promo** — non-fatal.
8. **Gateway resolve** — `gwRegistry.Get(payment_method)`.
9. **Wallet payer resolution** — kalau agent: `payer = caller.ParentResellerID`, metadata `{agent_id}` untuk audit ke wallet_ledger.
10. **Gateway.CreateCharge** — 
    - Wallet: sync debit → ledger entry ID.
    - Midtrans/Paylabs: return payment_url untuk redirect.
    - Manual bank: return instructions markdown.
11. **SavePaymentRef** — invoice.payment_gw_ref = providerRef (webhook lookup nanti).
12. **INSERT domain_purchases row** — status: `pending_payment` untuk gateway, `pending_provisioning` untuk wallet.
13. **Wallet flow sync**: 
    - `invoicesSvc.MarkPaid(invoiceID)` → status paid.
    - `ExecuteAfterPayment(invoice)` inline.
14. **Response**: `202 Accepted {job_id, invoice_id, status, payment_url}`. Frontend redirect ke `/sites/pending/[job_id]`.

### 3.4 ExecuteAfterPayment — the EPP call

[execute.go](apps/api/internal/domain_purchase/execute.go) `executeRegister`:

1. Load owner profile → build EPP contact object.
2. `registrar.RegisterDomainDirect(ctx, req)` — HTTP call ke api-registry (HMAC-signed).
3. **api-registry side** ([epp/register.go](apps/api-registry/internal/epp/register.go)):
   - `ensureContact` — `contact:create` idempotent (kode 2302 = exists, swallow).
   - `client.CreateDomain(frame)` → EPP `<create>` frame ke PANDI.
   - Parse response → return `{job_id: "epp_myshop.id_20260204120000", status: "active"}`.
4. **Update `domain_purchases.status = active`** via `repo.UpdateStatus(idemKey, ...)`.
5. **Fetch fresh info** — `registrar.InfoDomain(domain)` → dapat `expires_at` + `registrant` handle.
6. **UpsertDomain** — insert/update row di `registered_domains` dengan `name, contact_id, expires_at, registered_at, status, registrar_job_id`. Ini yang jadi source-of-truth aggregate.
7. **Sync expiry ke purchase row** — `UpdateStatus(idemKey, active, "", &expiresAt)`.
8. **tryAttachToCloudflare** (best-effort — kalau `cloudflare != nil`):
   - Fetch default Cloudflare config → API token + platform_ips.
   - CF `POST /zones {name: myshop.id}` → dapat NS assignment (mis. `noel.ns.cloudflare.com`, `sonja.ns.cloudflare.com`) + `zone_id`.
   - CF `POST /zones/{id}/dns_records A @ PLATFORM_IP proxied=true`.
   - CF `POST /zones/{id}/dns_records CNAME www @ proxied=true`.
   - `registrar.UpdateNameservers(domain, [ns1, ns2])` → EPP `<update><chg><ns>` → registrar simpan NS baru di registry.
   - Semua error di-log tapi non-fatal (domain sudah aktif di registry, CF cuma optimization).

### 3.5 Frontend: polling + template picker

**UI**: `/sites/pending/[jobId]` ([page.tsx](apps/web/app/sites/pending/[jobId]/page.tsx)):

1. Adaptive polling `GET /api/v1/domains/purchases/[jobId]` — 2s selama `pending_payment`, 5s untuk `pending_provisioning`, stop di terminal state.
2. Kalau status `active` && `kind=register` && `site_id=null` → render `<TemplatePicker>`:
   - Fetch `GET /api/v1/templates` → group by category (5 category × 3 variant).
   - Tiap template card: nama, deskripsi, tombol **Preview** (buka iframe `/template-preview/:slug` di modal).
   - User pilih template → input nama situs (default dari SLD domain).
3. **Submit**: `POST /api/v1/sites/from-template/:slug` dengan `{name, job_id}` — atomic:
   - Backend load `templates.GetBySlug(slug)`.
   - INSERT `sites` (theme_json + slug snapshot).
   - INSERT `pages` (block trees from template).
   - `AttachSite(purchase.job_id, site.id)` → link.
   - `AttachDomainSite(domain.name, site.id)` → link `registered_domains.site_id`.
4. **Response**: `{id, slug}` → frontend `router.push('/sites/[id]/editor')`.

### 3.6 Renderer serves the site

Setelah DNS propagate (1-60 menit, tergantung NS update speed):

1. User public buka `https://myshop.id` → hits Caddy → renderer container.
2. **Renderer** ([app/[...slug]/page.tsx](apps/renderer/app/[...slug]/page.tsx)):
   - Baca `Host` header.
   - `GET /public/site-by-host?host=myshop.id` ke web-builder API.
   - Response: `{site_id, slug}` → mapping ke sites row.
   - `GET /public/sites/[id]/pages/_home` → block tree.
   - Render HTML dengan theme CSS variables + Google Fonts inject.
3. **ISR** — `revalidate: 30` di renderer page → cache 30 detik per Host+path.

---

## 4. Alternative paths

### 4.1 Payment gateway async (Midtrans / Paylabs)

Beda utama dari flow wallet (sync):

1. Purchase handler: status `pending_payment`, response include `payment_url`.
2. User redirect ke Midtrans Snap / Paylabs redirect → bayar.
3. Gateway callback `POST /webhooks/payment/:code` → [paymentwh handler](apps/api/internal/paymentwh/handler.go):
   - Verify signature (HMAC per gateway).
   - `invoicesSvc.MarkPaid` → paid.
   - `onPaid` callback → `domain_purchase.ExecuteAfterPayment` (langkah sama dari 3.4).
4. Frontend polling pick up status `active` → template picker muncul.

### 4.2 Manual bank transfer

1. Purchase handler: return `instructions` markdown (bank + rekening + nominal + code).
2. Status stuck `pending_payment` sampai admin verify.
3. User transfer → upload bukti di `/reseller/wallet/topup/[id]` (untuk topup) atau invoice detail (untuk domain purchase).
4. Admin `/admin/wallet/topups` atau `/admin/invoices` → **Approve** → `invoicesSvc.MarkPaid` + trigger `ExecuteAfterPayment` seperti webhook.

### 4.3 EPP execute gagal

Contoh: PANDI EPP down, contact validation fail, TLD reject.

1. `RegisterDomainDirect` return error → `executeRegister` → `repo.UpdateStatus(idemKey, StatusFailed, err.Error(), nil)`.
2. Frontend polling lihat `status: failed` + `reason` → render tombol **Retry**.
3. User klik retry → `POST /purchases/:job_id/retry` → re-run `ExecuteAfterPayment`. Invoice sudah paid, tidak bayar ulang.
4. Kalau retry masih fail 3x → admin bantu manual (via /admin/domain/purchases).

### 4.4 Cloudflare gagal / disabled

Kalau CF config tidak ada atau `tryAttachToCloudflare` error:
- Domain tetap `active` di registrar (EPP CREATE sudah sukses).
- User harus set NS manual ke provider mereka via `/settings/domains/[name]` → tab Nameservers.
- Atau pakai CNAME/A record ke IP platform.

---

## 5. Post-completion state

| Tabel | Row | Kolom penting |
|-------|-----|---------------|
| `domain_purchases` | 1 baris | `kind=register`, `status=active`, `expires_at`, `site_id`, `payment_method` |
| `registered_domains` | 1 baris | `name`, `contact_id`, `expires_at`, `site_id`, `status=active` |
| `invoices` | 1 baris | `status=paid`, `paid_at`, `total`, metadata `{kind:register, domain}` |
| `sites` | 1 baris | `user_id`, `name`, `slug`, `theme_json` snapshot from template |
| `pages` | N baris | Home + tambahan sesuai template (mis. About, Contact, Blog) |
| `wallet_ledger` (kalau wallet) | 1 baris | `delta=-nominal`, `reason=debit_register`, `reference_id=invoice_id` |
| `domains` (custom hostname / SSL) | 0 baris (default) | Baru masuk kalau user tambah custom hostname yg beda dari registered domain |
| `audit_log` | 3-4 baris | `EventPurchaseCreated`, `EventDomainRegistered`, `EventSiteCreated`, `EventDomainAttached` |

---

## 6. Metrics + observability

- `domain_purchase_created_total{result, gateway}` — checkout counter
- `domain_purchase_execute_after_payment_total{result, kind}` — EPP execute counter
- `payment_webhooks_total{code, result}` — gateway webhook counter
- Log line di api-registry `tmp/epp.log` — pretty-XML request/response EPP (via zap logger, level Debug)

---

## 7. Testing checklist (integration)

- [ ] Register `.id` dengan wallet + template UMKM → domain live < 60 detik + situs editable
- [ ] Register `.com` dengan Midtrans → webhook callback → status active
- [ ] Register dengan manual_bank → admin approve di `/admin/invoices/:id/mark-paid` → provisioning jalan
- [ ] Retry setelah EPP gagal (mock api-registry error) → tidak bayar ulang, invoice tetap paid
- [ ] Cloudflare auto-attach — CF zone terbuat + NS di-update ke registrar → dig NS ok
- [ ] Setelah DNS propagate, `curl https://myshop.id` return HTML dari renderer
- [ ] `expires_at` di list `/settings/domains` sinkron dengan WHOIS

---

## 8. Related docs

- [flow-reseller-register-domain.md](flow-reseller-register-domain.md) — reseller on-behalf-of variant
- [CLAUDE.md](.claude/CLAUDE.md) — konvensi codebase
