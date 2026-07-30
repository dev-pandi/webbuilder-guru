# Plan: Web Builder Application

Multi-tenant web builder dengan custom domain, template gallery, visual editor, dan export ke static site.

## 1. Arsitektur Tingkat Tinggi

```
                                 ┌─────────────────────────┐
                                 │   User Browser          │
                                 └───────────┬─────────────┘
                                             │ HTTPS
                                             ▼
                          ┌──────────────────────────────────┐
                          │   Caddy (reverse proxy + ACME)   │
                          │  - on-demand TLS untuk custom    │
                          │    domain user                   │
                          │  - ask endpoint → backend        │
                          └──────────────┬───────────────────┘
                                         │
                ┌────────────────────────┼────────────────────────┐
                ▼                        ▼                        ▼
        ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
        │ Next.js app  │         │ Renderer SSR │         │ Go Fiber API │
        │ (dashboard,  │         │ (Next.js     │         │ (REST + Auth │
        │  editor,     │         │  multi-      │         │  + Builder   │
        │  marketing)  │         │  tenant)     │         │  + Domain)   │
        └──────────────┘         └──────┬───────┘         └──────┬───────┘
                                        │                        │
                                        └───────────┬────────────┘
                                                    ▼
                                      ┌─────────────────────────┐
                                      │      PostgreSQL         │
                                      │  - users, sites, pages, │
                                      │    domains, templates,  │
                                      │    assets, audit_log    │
                                      └─────────────────────────┘
                                                    │
                                                    ▼
                                      ┌─────────────────────────┐
                                      │ Object Storage (S3/MinIO)│
                                      │  - media uploads        │
                                      │  - exported zip bundles │
                                      └─────────────────────────┘
```

Domain split (saran):
- `app.<root>` → Next.js dashboard + visual editor.
- `api.<root>` → Go Fiber (JWT-protected).
- `*.<root>` dan custom domain user → Next.js renderer (SSR + ISR), public.

## 2. Tech Stack

**Backend (Go Fiber)**
- Fiber v2, GORM atau sqlc + pgx, golang-migrate.
- JWT (access + refresh) via `gofiber/jwt`, argon2id untuk password.
- Caddy `on_demand_tls.ask` endpoint untuk validasi domain.
- Async worker (river / asynq) untuk export bundle, sitemap, image processing.

**Frontend (Next.js 15 / App Router)**
- TailwindCSS + shadcn/ui untuk dashboard.
- Visual editor: **Craft.js** (drag-and-drop, JSON tree, undo/redo) atau Puck. Rekomendasi: Craft.js karena lebih fleksibel untuk custom block.
- TanStack Query untuk data fetching, Zustand untuk editor state.
- Renderer: Next.js app yang baca page tree dari API, render ke React components, lalu static export per site untuk fitur export.

**Infra**
- PostgreSQL 16, Redis (sessions, rate limit, job queue).
- Caddy 2 di depan; konfigurasi on-demand TLS dengan ask endpoint.
- Docker Compose dev, opsi k8s untuk produksi.
- Object storage S3-compatible (MinIO untuk dev).

## 3. Skema Database (ringkas)

```sql
users(id, email unique, password_hash, name, role, created_at)
sites(id, user_id, slug unique, name, template_id, theme_json, status, created_at)
pages(id, site_id, slug, title, tree_json, seo_json, is_home, version, updated_at)
page_versions(id, page_id, tree_json, created_by, created_at)  -- history/undo per save
domains(id, site_id, hostname unique, status, verified_at, ssl_status, cert_renewed_at)
templates(id, slug, category, name, preview_url, tree_json, theme_json, is_premium)
assets(id, site_id, kind, url, size, mime, created_at)
exports(id, site_id, status, bundle_url, created_at, finished_at)
audit_log(id, user_id, action, target_type, target_id, meta_json, created_at)
```

Kategori template wajib: `school`, `umkm`, `portfolio`, `teacher`, `blog`.

## 4. Modul & Endpoint Backend (Fiber)

Group `/api/v1` (semua JSON, JWT kecuali yang publik).

**Auth** — `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.

**Sites** — `GET/POST /sites`, `GET/PATCH/DELETE /sites/:id`, `POST /sites/:id/duplicate`, `POST /sites/:id/publish`.

**Pages** — `GET/POST /sites/:id/pages`, `GET/PATCH/DELETE /pages/:id`, `GET /pages/:id/versions`, `POST /pages/:id/restore/:versionId`.

**Theme** — `GET/PUT /sites/:id/theme` (warna, font, radius, spacing tokens; konsumsi sebagai CSS variables di renderer).

**Templates** — `GET /templates`, `GET /templates/:slug`, `POST /sites/from-template/:slug`.

**Assets** — `POST /sites/:id/assets` (multipart → S3, return URL).

**Domains** — `POST /sites/:id/domains`, `DELETE /domains/:id`, `POST /domains/:id/verify` (cek DNS A/CNAME), `GET /domains/:id/status`.

**Domain purchase (registrar reseller)** — beli domain baru untuk user langsung dari web builder (bukan pointing custom domain existing):
- `POST /sites/:id/domain-purchase/check` → proxy ke `POST /reseller/domain/check` di registrar-api
- `POST /sites/:id/domain-purchase/register` → proxy ke `POST /reseller/domain/register`
- `POST /domain-purchase/:job_id/document` → proxy ke `POST /reseller/domain/register/:job_id/documents`
- `GET /domain-purchase/:job_id/status` → poll `GET /reseller/domain/register/:job_id/status`
- Webhook receiver `POST /internal/registrar/webhook` → menerima notifikasi status dari registrar-api (HMAC-SHA256 verify), broadcast ke user via SSE/WebSocket atau update site status

Detail integrasi di §14.

**Caddy hook** — `GET /internal/caddy/ask?domain=...` → 200 jika domain `verified` + site `active`, 403 lainnya. Lindungi via shared secret/IP allowlist.

**Public renderer endpoints** — `GET /public/sites/by-host?host=...`, `GET /public/sites/:id/pages/:slug` (dipanggil dari Next.js renderer, dengan cache header).

**Export** — `POST /sites/:id/export` → buat job, `GET /exports/:id` → status & download URL bundle zip.

## 5. Modul Frontend (Next.js)

**Marketing/landing** (`/`) — hero, fitur, daftar template, pricing, CTA.

**Auth pages** — `/login`, `/register`, `/forgot-password`.

**Dashboard** (`/dashboard`)
- List sites, status publish, custom domain badge, quick action duplicate/delete.
- Tombol "Create new site" → modal pilih template (5 kategori).

**Editor** (`/sites/[id]/editor`)
- Layout: sidebar block library, canvas iframe responsive preview (desktop/tablet/mobile breakpoint switcher), panel kanan properti block + style + tailwind tokens.
- Block dasar: Section, Container, Heading, Text, Image, Button, Grid, Hero, Feature list, Pricing, Form, Navbar, Footer, Gallery, Testimonial, Map, Embed (YouTube).
- Block khusus per template (mis. `SchoolHeroAnnouncement`, `ProductGrid`, `BlogList`).
- Undo/redo via Craft.js history; autosave debounce → `PATCH /pages/:id`.

**Pages manager** (`/sites/[id]/pages`) — list, add, set as home, edit slug/SEO.

**Theme editor** (`/sites/[id]/theme`) — warna, font Google, radius, dark mode toggle. Output JSON tokens → renderer pasang sebagai CSS variables di `<html>`.

**Domains** (`/sites/[id]/domains`) — tambah hostname, tampilkan DNS instructions (A record ke IP Caddy atau CNAME ke renderer host), tombol verify, status SSL realtime.

**Export** (`/sites/[id]/export`) — pilih format (HTML/CSS/JS zip), trigger job, progress + download.

**Settings** — billing placeholder, profile, password.

## 6. Multi-Domain & SSL (Caddy)

`Caddyfile` (intinya):
```
{
  on_demand_tls {
    ask http://api-internal:8080/internal/caddy/ask
    interval 2m
    burst 5
  }
}

# Default app + api
app.example.id { reverse_proxy nextjs:3000 }
api.example.id { reverse_proxy api:8080 }

# Catch-all untuk custom domain user + subdomain *.example.id
:443 {
  tls {
    on_demand
  }
  reverse_proxy renderer:3001
}
```

Flow custom domain user:
1. User tambah `example.id` di dashboard → backend simpan status `pending`.
2. UI tampilkan instruksi: arahkan A record ke IP Caddy (atau CNAME ke `cname.<root>`).
3. User klik "Verify" → backend cek DNS resolve ke IP yang diharapkan → status `verified`.
4. Saat user pertama kali buka `https://example.id`, Caddy panggil `ask` → 200 → minta cert via ACME → cache → serve via renderer.
5. Renderer pakai header `Host` untuk lookup `sites.by-host` → render page.

Hardening: rate limit ask endpoint, batasi jumlah domain per akun, blacklist domain mainstream untuk anti-abuse.

## 7. Renderer & Mode Publikasi

Dua mode dari satu sumber JSON tree:
1. **SSR live** — Next.js renderer baca dari API per request (dengan `revalidate` + tag-based revalidation saat publish).
2. **Export statis** — worker render setiap page via headless renderer (Next.js `next export` per-site atau custom React-to-HTML), inline CSS Tailwind hasil JIT, copy aset → zip → upload ke S3 → kasih signed URL.

Tailwind dipakai dengan generator JIT per export: kumpulkan class yang muncul di tree → jalankan `tailwindcss` CLI dengan content list dinamis → output minified CSS.

## 8. Authentication & Authorization

- Argon2id password hashing, JWT access 15m + refresh 7d (HTTP-only cookie + rotation).
- Role: `owner` (per site), `admin` (platform). Setiap query backend wajib check ownership `site.user_id == claims.sub`.
- CSRF protection untuk dashboard mutation (double submit cookie).
- Rate limit login/register, audit log untuk perubahan domain & publish.

## 9. Template Awal (5 kategori)

Tiap template = `tree_json` lengkap + `theme_json` + minimal 3 page (Home, About, Contact) + asset placeholder.

- **Sekolah** — hero pengumuman, profil sekolah, program/jurusan, galeri, kontak, peta.
- **UMKM/Jualan** — hero produk unggulan, katalog grid, testimoni, form pemesanan WhatsApp, footer kontak.
- **Portofolio** — hero personal, project grid, skill, blog ringkas, contact form.
- **Guru** — profil, jadwal mengajar, materi/download, blog, kontak.
- **Blog** — featured post, list post, kategori, about author, newsletter signup.

## 10. Export ke HTML/CSS/JS

Job worker:
1. Tarik semua pages + theme + assets.
2. Render React tree → HTML string (renderToString) per page.
3. Generate Tailwind CSS dengan content = HTML hasil render.
4. Bundle minimal JS (hanya untuk block interaktif: nav toggle, form, slider) via esbuild.
5. Copy media dari S3 → folder `assets/`.
6. Struktur output:
   ```
   site-export/
     index.html
     about/index.html
     ...
     assets/css/styles.min.css
     assets/js/app.min.js
     assets/img/...
     robots.txt, sitemap.xml
   ```
7. Zip + upload, tampilkan tombol download di UI.

## 11. Roadmap Implementasi (fase)

**Fase 0 — Foundation (1 minggu)**
- Repo monorepo (`apps/api`, `apps/web`, `apps/renderer`, `packages/blocks`, `infra/`).
- Docker Compose: postgres, redis, minio, caddy, api, web, renderer.
- Migrations dasar, healthcheck, CI lint+test.

**Fase 1 — Auth + Sites CRUD (1 minggu)**
- Register/login, JWT, dashboard list/create site, schema sites/pages.
- Renderer minimal: render satu page hardcoded dari DB.

**Fase 2 — Visual Editor MVP (2 minggu)**
- Integrasi Craft.js, 10 block dasar, autosave, page manager, theme tokens.
- Publish flow (status draft/published, revalidate tag).

**Fase 3 — Templates (1 minggu)**
- Seeder 5 template, flow "create from template".

**Fase 4 — Custom Domain + Caddy (1 minggu)**
- Endpoint domain + verify, Caddyfile + ask endpoint, on-demand TLS, renderer multi-tenant by host.

**Fase 5 — Export (1 minggu)**
- Worker export, Tailwind JIT, zip upload, UI download.

**Fase 6 — Polishing (1 minggu)**
- SEO (meta, OG, sitemap, robots), responsive QA, perf (image optim, ISR), audit log, rate limit, error tracking (Sentry).

Total estimasi: ±8 minggu untuk MVP solid.

## 12. Risiko & Mitigasi

- **Abuse domain (phishing)** — verifikasi DNS wajib, manual review jika domain mirip brand populer, kill switch via `ask` endpoint.
- **Cert ACME rate limit Let's Encrypt** — pakai on-demand + cache, fallback ZeroSSL, monitor jumlah cert per minggu.
- **Editor state besar** — kompres `tree_json`, simpan versi sebagai diff opsional, batasi history retention.
- **Export Tailwind lambat** — cache hasil JIT per theme hash, jalankan paralel per page.
- **SSRF/abuse di block Embed** — whitelist domain (YouTube, Maps, Vimeo) di sisi renderer.

## 13. Struktur Folder Usulan

```
web-builder/
  apps/
    api/              # Go Fiber
      cmd/server/
      internal/{auth,sites,pages,domains,export,caddy,db,middleware}
      migrations/
    web/              # Next.js dashboard + editor + marketing
      app/(marketing)/
      app/(auth)/
      app/(dashboard)/
      app/sites/[id]/editor/
    renderer/         # Next.js multi-tenant SSR
      app/[...slug]/page.tsx
      lib/host-resolver.ts
  packages/
    blocks/           # Definisi block React + schema, dipakai editor & renderer
    ui/               # shadcn components shared
    tailwind-preset/
  infra/
    caddy/Caddyfile
    docker-compose.yml
    k8s/
  worker/             # export & background jobs
```

## 14. Integrasi Registrar-API Reseller (domain purchase flow)

Web builder = **reseller** di registrar-api (`../Golang/registrar-api/plan.md`).
Backend Fiber kita jadi proxy antara UI user dan registrar-api reseller
endpoints. Konsumen registrar-api = server web builder (server-to-server),
bukan browser user langsung.

### 📌 Changelog integrasi (per update backend 2026-07-27)

Yang HARUS di-adjust di web builder karena backend berubah:

1. **Endpoint baru — cancel job pre-payment**
   `POST /reseller/domain/register/:job_id/cancel` (guard: hanya `pending_payment`).
   - Tambah button "Cancel" di UI reseller yang show pending_payment jobs.
   - Client SDK: expose `CancelResellerJob(ctx, jobID)` di `internal/registrar/`.

2. **Job status baru — `canceled` + `expired`**
   Reducer / state machine yang render job status HARUS handle 2 nilai baru:
   - `canceled` — manual cancel via endpoint #1
   - `expired` — auto via `InvoiceExpiredCron` 24 jam post-create
   Sebelumnya cuma tahu: `pending_payment`, `pending_document`, `pending_provisioning`, `active`, `failed`.

3. **Webhook payload — 2 status baru masuk enum**
   Handler webhook `X-Registrar-Signature` yang case-switch on status harus
   tambah case `canceled` + `expired`. Payload shape sama.

4. **Renew webhook sekarang fire** (sebelumnya bug)
   Renew job sekarang trigger webhook untuk transition `pending_provisioning`
   → `active`/`failed`. Pastikan handler tidak error/duplicate untuk `kind=renew`.

5. **Retry sekarang terima `pending_provisioning`** (bukan hanya `failed`)
   UI bisa show tombol Retry untuk job stuck di `pending_provisioning` (mis. > 15 menit
   sejak last update). Berguna kalau worker crash + task archived asynq.

Backend fix internal (tidak butuh frontend change):
- CreateDomain worker nil panic guard
- Contact.go inverted create logic
- DomainRenew row insert di renew handler
- EPP response nil guards di semua handler + worker
- Idempotent retry via `InfoDomain` ownership check

### 📌 Changelog integrasi (per update backend 2026-07-30)

**Update contact untuk domain aktif:**

Endpoint baru `PATCH /reseller/domain/:name/contact` — reseller (via web
builder) bisa update contact info end-user (nama, email, phone, alamat, NIK)
untuk domain aktif. Sync ke registry EPP + DB.

Client SDK expose `UpdateResellerDomainContact(ctx, domainName, payload)`:

```go
type UpdateContactPayload struct {
    Name        string `json:"name"`         // required
    Email       string `json:"email"`        // required (format email)
    Phone       string `json:"phone"`        // required
    Address     string `json:"address"`      // required
    City        string `json:"city"`         // required
    State       string `json:"state,omitempty"`
    PostalCode  string `json:"postal_code"`  // required
    CountryCode string `json:"country_code,omitempty"` // default "ID"
    Nik         string `json:"nik,omitempty"` // WAJIB untuk zone .id
}

type UpdateContactResponse struct {
    Domain    string `json:"domain"`
    ContactID uint64 `json:"contact_id"`
    NicHandle string `json:"nic_handle"`
    Name      string `json:"name"`
    Email     string `json:"email"`
    Phone     string `json:"phone"`
    Message   string `json:"message"`  // 3 varian (lihat §14.10)
}
```

**UX di web builder:**
- End-user UMKM di dashboard web builder: form "Info Kontak Domain" dengan
  pre-fill dari cache lokal (data terakhir dari register response).
- Submit → backend web builder call `UpdateResellerDomainContact` → return
  ke user dengan pesan sesuai `message` field.
- Payload FULL required — client-side merge dari state lama sebelum PATCH.

Detail spec di §14.10 di bawah.

### 14.1 Setup awal

1. Admin registrar-api create account untuk web builder company:
   - Register user via `POST /api/global/register` biasa
   - Admin: `PATCH /api/admin/user/:id/reseller` dengan `{"is_reseller": 1}`
   - Admin: `PUT /api/admin/user/:id/reseller/zones` dengan `{"zones": ["biz.id", "web.id"]}` (atau `[]` untuk semua)
   - Admin: `POST /api/admin/user/:id/reseller/webhook` dengan `webhook_url` → dapat plaintext `webhook_secret` (simpan sekali!)
2. Web builder ENV vars:
   ```
   REGISTRAR_API_BASE_URL=https://api.pandi.id
   REGISTRAR_API_EMAIL=reseller@webbuilder.id
   REGISTRAR_API_PASSWORD=...
   REGISTRAR_WEBHOOK_SECRET=64-hex-chars-from-admin
   ```
3. Login flow: server-side saja, JWT reseller **TTL 30 hari**. Simpan token
   di DB (encrypted at rest) + auto-refresh sebelum expiry.

### 14.2 Client Go (di `internal/registrar/`)

Struct + factory dasar:

```go
type Client struct {
    base   string
    token  string
    httpc  *http.Client
}

func NewClient(base, email, password string) (*Client, error) {
    // POST /v1/api/user/login → dapat token
    // Set c.token, return
}

func (c *Client) authHeader(req *http.Request) {
    req.Header.Set("Authorization", "Bearer "+c.token)
}
```

Methods yang perlu:

| Method Go | Endpoint registrar-api |
|-----------|------------------------|
| `CheckDomain(sld string)` | `POST /reseller/domain/check` body `{"domain": "sld"}` → multi-zone results |
| `RegisterDomain(req RegisterReq)` | `POST /reseller/domain/register` |
| `JobStatus(jobID string)` | `GET /reseller/domain/register/:job_id/status` |
| `UploadJobDoc(jobID, file, catID)` | `POST /reseller/domain/register/:job_id/documents` multipart |
| `RetryJob(jobID string)` | `POST /reseller/domain/register/:job_id/retry` |
| `ListDomains(externalUserID string)` | `GET /reseller/domain/list?external_user_id=X` |
| `Renew(name string, req RenewReq)` | `POST /reseller/domain/:name/renew` |
| `GetNS(name string)` | `GET /reseller/domain/:name/nameservers` |
| `UpdateNS(name string, ns []string)` | `POST /reseller/domain/:name/nameservers` |
| `ListDocuments(externalUserID)` | `GET /reseller/documents?external_user_id=X&all=true` |
| `UploadDocument(externalUserID, file, catID)` | `POST /reseller/documents` multipart |

### 14.3 Design keputusan penting

**No ID masking di reseller API.** Web builder simpan **plain int** IDs
langsung dari response ke DB:
- `documents.id`, `invoice_id` → plain int (stable across APP_KEY rotation)
- `job_id` → opaque string `job_xxx` (tidak masked, memang string ID)
- `external_user_id` → UUID dari sisi web builder (opaque tag)

Rationale: reseller API server-to-server, masking tidak protect enumeration
(end-user tidak call langsung). Plain int lebih safe untuk long-term storage
+ debugging. Lihat backend plan §10.7.

**Ownership isolation dua lapis:**
1. **Cross-reseller** — JWT `is_reseller=1` + registrar-api middleware
   auto-scope by `user_id`. Web builder A tidak bisa lihat web builder B.
2. **Cross-end-user** — `external_user_id` tag di setiap dokumen + job.
   Web builder WAJIB kirim `external_user_id` di:
   - Setiap `POST /reseller/documents` upload (tanpa ini → 400)
   - `GET /reseller/documents?external_user_id=X` untuk picker per-user
   - `POST /reseller/domain/register` body — divalidasi match dengan
     `document_ids[].external_user_id`

Tanpa external_user_id filter, dokumen KTP UMKM A bisa leak ke UMKM B dropdown
(tersimpan di user_id yang sama = web builder). CRITICAL.

### 14.4 Flow domain purchase (end-to-end)

```
┌─────────────────────────────────────────────────────────────────┐
│ User Browser                          Web Builder BE            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Ketik "myshop" di wizard          → POST /sites/:id/domain- │
│                                        purchase/check           │
│                                                                 │
│                                        ↓ proxy                  │
│                                                                 │
│                     Web Builder BE  → POST /reseller/domain/    │
│                                        check                    │
│                                        body: {"domain":"myshop"}│
│                                                                 │
│                     Registrar-API   ← results[] multi-zone      │
│                                        + zone.require_document, │
│                                        allowed_zones            │
│                                                                 │
│ 2. UI tampilkan opsi: myshop.biz.id, myshop.web.id, ...         │
│    User pilih myshop.biz.id (zone.require_document=true)        │
│    UI prompt upload KTP (karena require_document=true, no NIK)  │
│                                                                 │
│ 3. Upload KTP → POST /sites/:id/domain-purchase/upload          │
│                        ↓ proxy                                  │
│                     BE → POST /reseller/documents               │
│                          multipart: file, external_user_id,     │
│                                     category_id                 │
│                          ← {id: 42} (plain int, no masking)     │
│                     BE simpan doc_id=42 di web builder DB       │
│                                                                 │
│ 4. Checkout: POST /sites/:id/domain-purchase/register           │
│                        ↓ proxy                                  │
│                     BE → POST /reseller/domain/register         │
│                          body: {                                │
│                            domain, years, contact,              │
│                            external_user_id: user.uuid,         │
│                            document_ids: [42],                  │
│                            payment_method: "midtrans",          │
│                            idempotency_key: uuid.NewString()    │
│                          }                                      │
│                          ← {job_id, payment_url,                │
│                             next_action: "wait_provisioning"}   │
│                                                                 │
│ 5. UI redirect ke payment_url (Midtrans Snap)                   │
│                                                                 │
│ 6. User bayar → Midtrans callback ke registrar-api              │
│                                                                 │
│ 7. Registrar-API → POST webhook_url (web builder BE):           │
│                    /internal/registrar/webhook                  │
│                    {job_id, status: "pending_provisioning",     │
│                     signature: sha256=hex(hmac(secret,body))}   │
│                                                                 │
│ 8. Web builder BE verify HMAC → update site.status,             │
│    push SSE ke user browser: "Domain sedang di-provision"       │
│                                                                 │
│ 9. Worker registrar-api EPP CREATE selesai → webhook lagi:      │
│    {job_id, status: "active", expires_at}                       │
│                                                                 │
│ 10. UI notify user: "Domain aktif!" → publish site              │
└─────────────────────────────────────────────────────────────────┘
```

### 14.5 Webhook receiver

Backend endpoint: `POST /internal/registrar/webhook`

Verify HMAC-SHA256:

```go
func verifyRegistrarWebhook(r *http.Request, secret string) ([]byte, error) {
    // Read raw body (buffer)
    body, _ := io.ReadAll(r.Body)

    // Compute expected signature
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    want := "sha256=" + hex.EncodeToString(mac.Sum(nil))

    got := r.Header.Get("X-Registrar-Signature")
    if !hmac.Equal([]byte(got), []byte(want)) {
        return nil, errors.New("invalid signature")
    }

    // Verify timestamp (anti-replay, reject > 5 menit)
    ts, _ := strconv.ParseInt(r.Header.Get("X-Registrar-Timestamp"), 10, 64)
    if time.Since(time.Unix(ts, 0)) > 5*time.Minute {
        return nil, errors.New("timestamp too old")
    }
    return body, nil
}
```

Payload format:
```json
{
  "job_id": "job_2f8b19a3",
  "external_user_id": "user-uuid-in-web-builder",
  "domain": "myshop.biz.id",
  "status": "active",
  "reason": "",
  "expires_at": "2027-07-23T00:00:00Z",
  "sent_at": "2026-07-23T14:30:00Z"
}
```

Status values: `pending_payment`, `pending_document`, `pending_provisioning`,
`active`, `failed`, `expired`. Map ke site status di web builder DB.

**Retry policy** (server-side): registrar-api retry 5x dengan backoff
`30s → 2m → 10m → 1h → 6h`. Kalau ke-5 fail, admin registrar-api bisa
manual re-drive via `POST /admin/reseller/job/:job_id/webhook/redispatch`.

### 14.6 Schema DB tambahan

```sql
-- Track domain purchase jobs per site
CREATE TABLE site_domain_purchases (
    id                UUID PRIMARY KEY,
    site_id           UUID REFERENCES sites(id),
    user_id           UUID REFERENCES users(id),
    registrar_job_id  VARCHAR(64) UNIQUE,   -- job_xxx dari registrar-api
    domain            VARCHAR(255) NOT NULL,
    status            VARCHAR(32) NOT NULL, -- mirror registrar status
    expires_at        TIMESTAMPTZ,
    payment_url       TEXT,
    invoice_id_str    VARCHAR(64),          -- plain int as string
    external_user_id  VARCHAR(128),         -- kita pass ke registrar
    document_id_int   BIGINT,               -- registrar doc id (plain int)
    reason            TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON site_domain_purchases (user_id, external_user_id);
CREATE INDEX ON site_domain_purchases (status);
```

Isolation:
- `external_user_id` = user.uuid di web builder (kita pass sebagai opaque)
- `document_id_int` = plain int dari `POST /reseller/documents` response
- `registrar_job_id` = opaque string, dipakai untuk polling + webhook match

### 14.7 Zone whitelist & fitur promo

Beberapa fitur di registrar-api yang perlu di-expose di UI web builder:

- **Zone yang di-allow** — `zones.allowed_zones` di response check → tampilkan
  dropdown TLD sesuai scope reseller (mis. hanya `.biz.id`, `.web.id`)
- **`require_document` flag** — kalau `true` untuk zone yang dipilih, wizard
  wajib step "Upload KTP" sebelum lanjut checkout
- **`nik_auto_approved` bypass** — kalau `true` + user isi NIK, skip step
  upload KTP (Kemenkominfo whitelist tertentu)
- **`next_action` di register response** — konfirmasi backend flow:
  `wait_provisioning` (langsung tunggu) vs `upload_document` (masih perlu doc)
- **Promo code** (opsional) — pass `promo_code` di request register/renew,
  backend silent-fallback ke harga normal kalau invalid (no error)

### 14.8 Rate limit + error handling

- Registrar-api tidak explicit rate limit reseller. Web builder harus
  self-throttle:
  - Max 100 register/hour untuk 1 reseller (soft internal limit)
  - Exponential backoff kalau 502/503 dari registrar (EPP down)
- Error mapping:
  - 400/422 → surface ke UI (user salah input)
  - 403 → policy error, hint dari message (mis. zone tidak allowed)
  - 409 → conflict (domain sudah taken, idempotency key dobel)
  - 5xx → retry di worker (bukan fail-fast di request)

### 14.10 Update contact untuk domain aktif (backend 2026-07-30)

**Endpoint:** `PATCH /api/user/reseller/domain/:name/contact`

Reseller update info contact (nama, email, phone, alamat, NIK) untuk domain
yang sudah ter-register. Endpoint sync ke registry EPP + DB. Domain harus
milik reseller yang login (404 kalau bukan owner).

**Semua field WAJIB** (payload FULL, bukan partial): EPP `contact:update`
replace field. Client-side WAJIB merge dari state lama (mis. dari cache
web builder lokal atau `GET /reseller/domain/list`) sebelum PATCH.

**Response 200 — 3 varian berdasarkan state contact di registry:**

| Kondisi | `message` | Behavior |
|---|---|---|
| Contact sudah di-provisioning di registry | `"contact updated (DB + EPP registry)"` | EPP contact:update + DB update, keduanya sukses |
| Contact BELUM di-provisioning (domain masih pending) | `"contact updated (DB only — belum di-provisioning ke registry, akan disync saat domain aktif)"` | DB update saja. Worker `CheckContactAndCreate` akan sync data terkini saat domain provisioning nanti. |
| Data drift (registry contact hilang) | `"contact updated (registry state drift — auto-reset flag; akan re-provision saat domain aktif)"` | Backend auto-reset flag internal, DB update, worker re-provision |

Semua 3 varian return `200 OK` dengan body sukses — beda hanya di `message`.
Web builder UI bisa tampilkan warning banner kalau `message` contain "DB only"
atau "drift" (informasi supaya user tidak bingung kenapa update tidak
langsung reflect di WHOIS).

**Zone .id NIK guard:**
- Kalau `domain.zone` berakhir `.id` → `nik` field WAJIB non-empty (400 kalau
  kosong).
- NIK di-store di `domains.user_nik`, bukan di contact row. Update sekaligus
  update `domain.user_nik` kalau berbeda.

**Errors:**
- 400 — payload invalid / NIK kosong untuk .id / `country_code` tidak dikenal
- 404 — domain bukan milik reseller
- 502 — EPP registry reject (`contact:update code != 1000`) atau connection error
- 503 — EPP unreachable

**Recommended UX di web builder:**

1. **Domain detail page** — tampilkan section "Kontak Domain" dengan tombol
   "Edit Kontak". Klik → open form modal / navigate ke halaman edit.

2. **Form pre-fill** — dari cache web builder (data disimpan sejak register
   response). Kalau data hilang / stale, panggil `GET /reseller/domain/list`
   untuk refresh.

3. **Submit handler:**
   ```go
   resp, err := registrarClient.UpdateResellerDomainContact(ctx, domainName, payload)
   if err != nil {
       // handle 400/404/502 sesuai error type
       return err
   }
   // Update cache lokal dengan data baru
   cache.SetContact(domainName, resp)
   // Tampilkan message ke user (3 varian)
   showBanner(resp.Message)
   ```

4. **Message-to-banner mapping:**
   - Match `"DB + EPP registry"` → green banner "Kontak berhasil diperbarui"
   - Match `"DB only"` → yellow banner "Kontak tersimpan. Registry akan disync setelah domain aktif."
   - Match `"drift"` → orange banner "Data ter-update. Registry akan re-sync otomatis."

**Impact ke webhook:**
- Endpoint TIDAK fire webhook — update contact sifatnya request-response, bukan async job.
- Kalau web builder butuh notify end-user "kontak sudah diperbarui", handle di sisi web builder (mis. email confirmation setelah PATCH sukses).

### 14.9 Referensi

- Backend spec lengkap: [`../../Golang/registrar-api/plan.md`](../../Golang/registrar-api/plan.md)
- Bruno API collection: `../../Golang/registrar-api/bruno/`
- Frontend register-frontend plan (kalau reseller pakai owner dashboard):
  `../../Nextjs/register-frontend/plan.md`
- Reseller API endpoints (cheat-sheet):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/reseller/domain/check` | Availability + pricing multi-zone |
| POST | `/reseller/domain/register` | Register + payment URL |
| GET  | `/reseller/domain/register/:job_id/status` | Polling status |
| POST | `/reseller/domain/register/:job_id/documents` | Upload KTP post-payment |
| POST | `/reseller/domain/register/:job_id/retry` | Retry EPP fail |
| POST | `/reseller/domain/register/:job_id/cancel` | Cancel job pre-payment (guard: pending_payment) |
| GET  | `/reseller/documents` | List dokumen (filter external_user_id) |
| POST | `/reseller/documents` | Upload dokumen (tag external_user_id) |
| GET  | `/reseller/domain/list` | List domain milik reseller |
| POST | `/reseller/domain/:name/renew` | Renew |
| GET  | `/reseller/domain/:name/nameservers` | Baca NS |
| POST | `/reseller/domain/:name/nameservers` | Update NS |
| PATCH | `/reseller/domain/:name/contact` | Update contact info (registrant/admin/tech/billing) + sync EPP registry |
| GET  | `/reseller/config/webhook` | Read webhook URL |
| POST | `/reseller/config/webhook` | Rotate secret |

---

## 15. Hal yang Perlu Dikonfirmasi Sebelum Mulai

1. Target deploy: VPS single-node, Docker Swarm, atau k8s?
2. Object storage: pakai S3 AWS, MinIO self-host, atau lokal disk dulu?
3. Editor: oke pakai Craft.js (lisensi MIT) atau preferensi GrapesJS/Puck?
4. Apakah perlu billing/paywall di MVP, atau gratis dulu?
5. Bahasa UI: ID saja, atau ID+EN dengan i18n?
6. Limit per akun (jumlah site, domain, storage)?
