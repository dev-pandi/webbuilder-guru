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

## 14. Hal yang Perlu Dikonfirmasi Sebelum Mulai

1. Target deploy: VPS single-node, Docker Swarm, atau k8s?
2. Object storage: pakai S3 AWS, MinIO self-host, atau lokal disk dulu?
3. Editor: oke pakai Craft.js (lisensi MIT) atau preferensi GrapesJS/Puck?
4. Apakah perlu billing/paywall di MVP, atau gratis dulu?
5. Bahasa UI: ID saja, atau ID+EN dengan i18n?
6. Limit per akun (jumlah site, domain, storage)?
