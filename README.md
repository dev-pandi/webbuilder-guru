# Web Builder

Multi-tenant web builder. Lihat [plan.md](plan.md) untuk arsitektur lengkap.

## Struktur

```
apps/
  api/        # Go Fiber — REST API + auth + domain + Caddy hook
  web/        # Next.js — marketing + dashboard + editor
  renderer/   # Next.js — multi-tenant SSR renderer (by Host)
infra/
  caddy/Caddyfile
  docker-compose.yml
```

## Cepat (Docker Compose)

```bash
cp .env.example .env
cd infra
docker compose up --build
```

Service yang berjalan:

| Service       | URL (dev)                  | Catatan                                |
|---------------|----------------------------|----------------------------------------|
| Dashboard     | http://app.localhost       | Landing, login, dashboard, editor      |
| API           | http://api.localhost       | REST `/api/v1/*`                       |
| Renderer      | http://localhost           | Renderer publik (multi-tenant by host) |
| Postgres      | localhost:5432             | user/pass: `webbuilder/webbuilder`     |
| MinIO console | http://localhost:9001      | `minioadmin/minioadmin`                |

> Catatan: `app.localhost` & `api.localhost` umumnya diresolve oleh OS modern (macOS, Chrome, Firefox). Jika tidak, tambahkan ke `/etc/hosts`:
>
> ```
> 127.0.0.1 app.localhost api.localhost
> ```

## Dev tanpa Docker

API (butuh Go 1.22+ dan Postgres berjalan di `localhost:5432`):

```bash
cd apps/api
export DATABASE_URL='postgres://webbuilder:webbuilder@localhost:5432/webbuilder?sslmode=disable'
go run ./cmd/server
```

Web dashboard (butuh Node 20+):

```bash
cd apps/web
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8080 npm run dev
```

Renderer:

```bash
cd apps/renderer
npm install
API_INTERNAL_URL=http://localhost:8080 npm run dev -- -p 3001
```

## Alur Penggunaan

1. Buka http://app.localhost dan daftar akun.
2. Klik **Buat Situs Baru** → pilih template (sekolah/UMKM/portofolio/guru/blog) → isi slug & nama.
3. Edit JSON tree halaman di tab **Editor** (Phase 1 — Craft.js drag-and-drop akan ditambahkan di Phase 2).
4. Sesuaikan warna/font di tab **Tema**.
5. (Opsional) Tambahkan custom domain di tab **Domain**, arahkan A record DNS ke server, klik **Verifikasi**.
6. Klik **Publikasikan** di header.
7. Akses situs di `http://<slug>.localhost` (subdomain platform) atau custom domain Anda.

## Endpoint API utama

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me

GET  /api/v1/templates
POST /api/v1/sites/from-template/:slug

GET    /api/v1/sites
POST   /api/v1/sites
GET    /api/v1/sites/:id
PATCH  /api/v1/sites/:id
DELETE /api/v1/sites/:id
POST   /api/v1/sites/:id/publish

GET    /api/v1/sites/:id/pages
POST   /api/v1/sites/:id/pages
PATCH  /api/v1/pages/:id
DELETE /api/v1/pages/:id

GET    /api/v1/sites/:id/domains
POST   /api/v1/sites/:id/domains
POST   /api/v1/domains/:id/verify
DELETE /api/v1/domains/:id

# Renderer (public, internal)
GET /public/site-by-host?host=<hostname>
GET /public/sites/:id/pages/:slug   # slug "_home" = home page

# Caddy on-demand TLS hook
GET /internal/caddy/ask?domain=<hostname>
```

## Yang Belum (sesuai roadmap di plan.md)

- **Phase 2**: visual editor Craft.js (saat ini JSON tree + live preview).
- **Phase 5**: export ke HTML/CSS/JS bundle.
- **Phase 6**: image uploads ke MinIO, sitemap, rate limiting, Sentry.
