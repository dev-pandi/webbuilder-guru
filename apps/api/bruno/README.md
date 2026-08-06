# Bruno Collection — api (web-builder)

[Bruno](https://www.usebruno.com/) API testing collection untuk main API service (`apps/api/`). Auth via JWT Bearer — login sekali, token otomatis attached ke request selanjutnya via pre-request script.

## Install Bruno

```bash
# macOS
brew install bruno
# atau download desktop app dari https://www.usebruno.com/downloads

# Ubuntu / Debian
# https://www.usebruno.com/downloads → download .deb
```

## Load Collection

1. Buka Bruno desktop app.
2. **File → Open Collection** → arahkan ke folder ini (`apps/api/bruno/`).
3. Collection "api" muncul di sidebar dengan folder: Health, Auth, Sites, Pages, Templates, Domains, DomainManagement, Wallet, Invoices, Documents, Pricing, Promos, Reseller, Agent, Admin.

## Setup Environment

1. Pilih env di dropdown pojok kanan atas: **Local** atau **Production**.
2. Klik ikon pensil di sebelah env → set:
   - `base_url` — default `http://localhost:8080` (API dev via `go run ./cmd/server`).
   - `user_email` + `user_password` — kredensial akun test.
   - Field lain (`site_id`, `page_id`, `job_id`, `invoice_id`, `domain_name`) — akan terisi otomatis saat kamu jalanin request tertentu, atau isi manual sesuai kebutuhan.
3. Save.

**Local env** — target `http://localhost:8080` (default `HTTP_ADDR=:8080` di `apps/api/.env`).

**Production env** — ganti `base_url` sesuai deploy (mis. `https://api.yourdomain.com`).

## Auth Flow (JWT)

Bruno collection sudah setup 2 script otomatis:

1. **Pre-request script** (`collection.bru`) — attach `Authorization: Bearer {{access_token}}` ke semua request JWT-protected. Skip endpoint anonymous (login, register, refresh, public, webhooks, healthz).

2. **Post-response script** di `Auth/Login.bru` — otomatis capture `access_token` + `refresh_token` dari response body ke env vars. Sekali login, seluruh collection langsung authorized.

Cara pakai:

```
1. Auth/Login → hit Send → token otomatis tersimpan di env.
2. Jalankan endpoint mana pun (Sites/List, Domains/Check, dsb.) — token otomatis attached.
3. Kalau access token expired (15m), jalankan Auth/Refresh → token baru otomatis tersimpan.
```

Kalau dapat 401 `unauthorized`:
- Cek env `access_token` sudah terisi (Login gagal / tokennya expired).
- Refresh token 401 → login ulang.

## Struktur Collection

```
bruno/
├── bruno.json                     # config
├── collection.bru                 # pre-request script JWT auto-attach
├── environments/
│   ├── Local.bru
│   └── Production.bru
├── Health/
│   ├── Healthz.bru
│   ├── Livez.bru
│   ├── Readyz.bru
│   └── Metrics.bru
├── Auth/
│   ├── Register.bru
│   ├── Login.bru                  # capture token → env
│   ├── Refresh.bru                # rotate token → env
│   ├── Me.bru
│   ├── UpdateMe.bru
│   ├── Logout.bru
│   ├── ForgotPassword.bru
│   ├── ResetPassword.bru
│   └── ResellerApply.bru
├── Sites/
│   ├── List.bru
│   ├── Get.bru
│   ├── Update.bru
│   ├── Publish.bru
│   ├── Delete.bru
│   ├── CreateFromTemplate.bru
│   ├── Usage.bru
│   └── ListMembers.bru
├── Pages/
│   ├── ListBySite.bru
│   ├── CreateForSite.bru
│   ├── Get.bru
│   ├── Update.bru
│   ├── Publish.bru
│   ├── Unpublish.bru
│   └── Delete.bru
├── Templates/
│   ├── List.bru
│   └── Get.bru
├── Domains/
│   ├── Check.bru
│   ├── Purchase.bru               # capture job_id + invoice_id → env
│   ├── Renew.bru
│   ├── ListDomains.bru
│   ├── ListPurchases.bru
│   ├── PurchaseStatus.bru
│   └── PurchaseRetry.bru
├── DomainManagement/
│   ├── GetNameservers.bru
│   ├── UpdateNameservers.bru
│   ├── Whois.bru
│   ├── UpdateContact.bru
│   ├── ListDNS.bru
│   ├── CreateDNS.bru
│   └── CloudflareInfo.bru
├── Wallet/
│   ├── GetBalance.bru
│   ├── ListLedger.bru
│   ├── CreateTopup.bru
│   ├── ListTopups.bru
│   ├── UploadTopupProof.bru
│   ├── AgentActivity.bru
│   └── AgentsBreakdown.bru
├── Invoices/
│   ├── ListMine.bru
│   ├── GetMine.bru
│   └── GetMinePDF.bru
├── Documents/
│   ├── ListCategories.bru
│   ├── ListMine.bru
│   ├── Upload.bru
│   ├── Show.bru
│   └── Delete.bru
├── Pricing/
│   ├── Resolve.bru
│   ├── Zones.bru
│   └── PaymentMethods.bru
├── Promos/
│   └── Validate.bru
├── Reseller/
│   ├── ListClients.bru
│   ├── CreateClient.bru
│   ├── InviteAgent.bru
│   ├── ListAgents.bru
│   ├── Stats.bru
│   ├── ListDomains.bru
│   ├── ListPurchases.bru
│   ├── ListInvoices.bru
│   └── UpsertPricing.bru
├── Agent/
│   ├── ListClients.bru
│   ├── ListPurchases.bru
│   ├── ListDomains.bru
│   └── Stats.bru
└── Admin/
    ├── Stats.bru
    ├── AuditLog.bru
    ├── EmailLog.bru
    ├── Users/
    │   ├── List.bru
    │   ├── Get.bru
    │   ├── UpdateRole.bru
    │   ├── Delete.bru
    │   ├── ListSites.bru
    │   └── ListInvoices.bru
    ├── Sites/
    │   ├── List.bru
    │   ├── UpdateQuota.bru
    │   └── Delete.bru
    ├── Domains/
    │   ├── List.bru
    │   ├── Get.bru
    │   ├── Whois.bru
    │   ├── CloudflareInfo.bru
    │   └── ListPurchases.bru
    ├── Invoices/
    │   ├── List.bru
    │   ├── Get.bru
    │   ├── MarkPaid.bru
    │   └── Cancel.bru
    ├── Wallet/
    │   ├── ListTopups.bru
    │   ├── Approve.bru
    │   ├── Reject.bru
    │   └── Adjust.bru
    ├── Resellers/
    │   ├── List.bru
    │   ├── Approve.bru
    │   └── Suspend.bru
    ├── Pricing/
    │   ├── ListPlatform.bru
    │   └── UpsertPlatform.bru
    ├── Promos/
    │   ├── List.bru
    │   ├── Create.bru
    │   └── ListRedemptions.bru
    ├── Zones/
    │   ├── List.bru
    │   └── Create.bru
    ├── Settings/
    │   ├── List.bru
    │   └── Update.bru
    ├── Payments/
    │   ├── List.bru
    │   └── Create.bru
    └── Templates/
        ├── List.bru
        ├── Create.bru
        └── Publish.bru
```

## Testing Workflow

### 1. Basic sanity

```
Health/Healthz → 200 { "status": "ok", "checks": {...} }
Health/Readyz  → 200 (db + storage OK) atau 503 (degraded)
```

### 2. Login flow

```
Auth/Login     → 200 { access_token, refresh_token, user }
                 (token otomatis tersimpan di env)
Auth/Me        → 200 { id, email, role, ... }
```

Kalau kamu belum punya akun test, buat dulu via `Auth/Register` atau bootstrap admin via env var `ADMIN_EMAIL` + `ADMIN_PASSWORD` di API.

### 3. Domain purchase E2E

```
1. Domains/Check           → 200 { available: true, zone: {...} }
2. Domains/Purchase        → 200 { job_id, invoice_id, payment_url }
                             (job_id + invoice_id otomatis ke env)
3. Domains/PurchaseStatus  → poll sampai status="active"
4. Sites/CreateFromTemplate → 200 { site: {...} }
                             (pakai {{job_id}} di body)
```

### 4. Renew

```
Domains/Renew → 200 { job_id, ... }
                (kind=renew, template picker skipped)
```

### 5. Admin ops (butuh role=admin)

```
Auth/Login (dengan akun admin)
Admin/Users/List             → 200 paginated users
Admin/Domains/List           → 200 paginated domains lintas user
Admin/Wallet/ListTopups?status=awaiting_verification → queue verify
Admin/Wallet/Approve         → credit wallet + ledger
```

## Debug 401 / 403

- **401 `unauthorized`** — token invalid/expired. Jalankan `Auth/Refresh` atau login ulang.
- **403 `forbidden`** — role tidak match (misal client hit endpoint reseller-only). Login pakai akun dengan role yang sesuai.
- **404 `not_found`** — bisa jadi ownership tidak match (untuk endpoint yang scope per-user). Server tidak leak existence, jadi 404 juga muncul kalau resource ada tapi bukan milik caller.

## Idempotency-Key

Endpoint money-moving butuh `Idempotency-Key` header:

- `POST /api/v1/domains/purchase`
- `POST /api/v1/domains/:name/renew`

Bruno support `{{$randomUUID}}` variable — sudah di-set di request body. Setiap Send generate UUID baru (kalau mau retry safe, hardcode manual dulu, lalu Send ulang).

## Alternative: curl

```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme123"}' \
  | jq -r '.data.access_token' > /tmp/token

# Authenticated request
curl -X GET http://localhost:8080/api/v1/sites \
  -H "Authorization: Bearer $(cat /tmp/token)"

# Purchase dengan idempotency key
curl -X POST http://localhost:8080/api/v1/domains/purchase \
  -H "Authorization: Bearer $(cat /tmp/token)" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"domain":"example.id","period_years":1,"payment_method_code":"deposit_wallet"}'
```

## References

- Bruno docs: https://docs.usebruno.com/
- Bruno scripting: https://docs.usebruno.com/scripting/getting-started.html
- API router: [apps/api/internal/router/](../internal/router/) (`user.go`, `admin.go`, `global.go`)
- Envelope: [httpx package](../internal/httpx/) (`{ data }` / `Paginated<T>` / `{ error }`)
- CLAUDE.md: [../../../CLAUDE.md](../../.claude/CLAUDE.md)
- Sibling collection: [apps/api-registry/bruno/](../../api-registry/bruno/)
