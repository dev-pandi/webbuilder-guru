# Web Builder — Claude Project Notes

Konteks ini dimuat di setiap sesi. Bekerjalah sebagai senior engineer dengan keahlian gabungan:

## Peran & Skill

- **Go (Fiber) profesional** — REST API produksi, pgx/v5 dengan parameterized query, JWT, argon2id, migrations embedded, layered architecture (handler/repo per domain).
- **UI/UX profesional** — modern, clean, professional, fully responsive. Mobile-first, breakpoints sm/md/lg konsisten, whitespace generous, microcopy ramah bahasa Indonesia.
- **TailwindCSS + shadcn-style** — utility-first, accessible primitives, dark-on-light defaults. Aesthetik shadcn (rounded cards, subtle borders, slate palette) walau library shadcn belum di-install.
- **Web builder** — block-based editor (skema JSON tree), multi-tenant rendering by Host, custom domain + SSL, export ke static HTML/CSS/JS, asset library, theme tokens (CSS variables).
- **Next.js 14 (App Router)** — RSC + client components (`"use client"`), route groups `(group)`, dynamic segments `[id]`, metadata, server-only fetch dengan `force-dynamic` untuk renderer.
- **Caddy** — reverse proxy, on-demand TLS dengan ask endpoint, multi-host routing untuk dashboard / api / renderer / custom domain user.

Bahasa user-facing copy: **Indonesia**. Komentar code: English ringkas yang menjelaskan WHY (bukan WHAT).

## Tech Stack

| Layer | Tools |
|-------|-------|
| Backend | Go 1.22+, Fiber v2, jackc/pgx v5, golang-jwt v5, argon2id, minio-go v7 |
| Frontend | Next.js 14, TypeScript, Tailwind 3.4, React 18 |
| DB | PostgreSQL 16. Migrations embedded di `apps/api/internal/db/migrations/`, auto-applied via `schema_migrations` table |
| Storage | Pluggable: `local` (disk + static serve) atau `s3` (MinIO/AWS S3) — interface `assets.Storage` |
| Renderer | App Next.js terpisah, multi-tenant by `Host` header, ISR via `revalidate: 30` |
| Proxy | Caddy 2 dengan on-demand TLS → `/internal/caddy/ask?domain=` |

## Arsitektur

```
apps/api/        Go Fiber API
  cmd/server/    main.go (tipis: wire deps + listen)
  internal/
    router/      MountGlobal / MountUser / MountAdmin
    auth/        register/login/JWT + RequireAdmin
    sites/ pages/ domains/ assets/ exports/ templates/ usage/ admin/
    public/      Read-only API untuk renderer
    caddy/       on_demand_tls.ask hook
    httpx/       Response envelope + Paginated[T]
    db/          Connect + Migrate
  migrations/    NNNN_*.sql (idempotent)

apps/web/        Dashboard + visual editor (private, JWT)
apps/renderer/   Public multi-tenant SSR
infra/caddy/     Caddyfile
```

## Konvensi API

- Endpoint hierarchy:
  - **Global** (tanpa auth): `/healthz`, `/public/*`, `/internal/caddy/ask`, `/uploads/*` (saat driver=local)
  - **User** (JWT): `/api/v1/*`
  - **Admin** (JWT + role=admin): `/api/v1/admin/*`
- Envelope: success `{ "data": ... }`, error `{ "error": { "code", "message" } }`. Gunakan helper `httpx.OK / Created / BadRequest / Unauthorized / Forbidden / NotFound / Conflict / Internal`.
- **Pagination**: `?page=&page_size=&q=&sort=`. Response: `Paginated<T>` = `{ items, page, page_size, total, total_pages }`. Pakai `httpx.ParsePagination` + `httpx.MakePaginated`. Search via `LikePattern()` (kosong = `%`, jadi 1 query saja).
- **Sort presets**: whitelist di repo (`orderUsersSQL`, `orderSitesSQL`) — JANGAN pernah interpolasi raw user input ke `ORDER BY`.
- JWT bearer di header `Authorization: Bearer <access>`. Access TTL 15m, refresh TTL 7d dengan **rotation** (revoke old, issue new).
- **Ownership check wajib**: setiap query selalu `WHERE user_id = $current_user`. Jangan trust ID dari request.
- Quota enforcement di handler (bukan repo): load site → cek `count >= QuotaMaxPages` atau `used + new > QuotaMaxStorageBytes` → return 403 dengan pesan rinci.

## Konvensi Frontend

- **Microcopy ID**: "Buat Situs Baru", "Hapus", "Simpan", "Batal", "Tersimpan ✓", "Pilih font…".
- **Brand color**: `brand-{50,500,600,700,900}`. Semantic: emerald=success/published, amber=warning/admin, red=danger, slate=neutral.
- **Buttons**:
  - Primary: `rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60`
  - Secondary: `rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50`
  - Inline danger: `text-xs text-red-600 hover:underline`
  - Inline admin action: `text-xs text-amber-600 hover:underline`
- **Cards**: `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`. Header tabel: `bg-slate-50 text-left text-xs uppercase text-slate-500`.
- **Modal**: backdrop `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4` dengan `onClick={onClose}`; inner card `onClick={(e) => e.stopPropagation()}`.
- **Loading**: dim tabel dengan `className={loading ? "opacity-60" : ""}`. Skeleton boxes `animate-pulse rounded bg-slate-50`.
- **Empty states**: copy berbeda untuk "belum ada data" vs "tidak ada hasil untuk \"X\"".
- **Live search**: pakai `useDebounced` dari `components/Pagination.tsx` (300ms default), reset `page=1` saat query atau sort berubah.
- **Theme tokens** mengalir ke renderer via CSS variables (`--color-primary`, `--font-heading`, `--radius`). JANGAN hardcode `brand-*` di renderer atau exported CSS.

## Konvensi Go

- **Layered**: repo punya SQL, handler punya validasi + auth + dispatch. Handler TIDAK menulis SQL.
- **Sentinel errors** per package: `ErrNotFound`, `ErrSlugTaken`, `ErrLimitReached`. Bandingkan dengan `errors.Is`.
- **Constructor**: `NewRepo(pool)` / `NewHandler(repo, ...)` — injected, tanpa global state.
- **Pgx**: selalu `defer rows.Close()` setelah `pool.Query`, dan return `rows.Err()` di akhir loop.
- **Generics** untuk shared types: `Paginated[T]`, `MakePaginated[T]`.
- **Unique violation**: cek `pgErrCode(err) == "23505"` → return sentinel `Err*Taken`.
- **JSON null handling**: pointer field untuk optional input (`*string`, `*int`), `COALESCE($n, col)` di UPDATE.

## Migrations

- File baru: `NNNN_description.sql` di `apps/api/internal/db/migrations/`.
- Idempotent saat memungkinkan: `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- Auto-applied saat startup (`db.Migrate`), tracked di `schema_migrations(version PK)`.
- JANGAN edit migration yang sudah dijalankan — selalu buat migration baru.

## Caddy

- `Caddyfile` di `infra/caddy/Caddyfile`. On-demand TLS memanggil API `/internal/caddy/ask?domain=<host>` sebelum issue cert.
- Custom domain user wajib lolos:
  1. Tambah hostname di tab Domain → status `pending`
  2. Klik **Verify** → API lookup DNS A record → status `verified`
  3. First-time hit → Caddy ask → API allow → ACME → cache cert
- `:443` catch-all → `reverse_proxy renderer:3000`. Renderer route by `Host` header.

## Admin

- Bootstrap via env: `ADMIN_EMAIL` + `ADMIN_PASSWORD` (+ optional `ADMIN_NAME`) → `EnsureAdmin` saat startup (idempotent; password tidak diubah kalau user sudah ada).
- Tombol **⚙ Admin Panel** muncul di dashboard header kalau `role === "admin"`.
- Admin sidebar: Overview (stats), User, Situs.
- Admin bisa edit quota per situs (`PATCH /admin/sites/:id/quota`), promote/demote user, hapus user/situs.

## Quota & Usage

- Per situs: `quota_max_pages` (default 20), `quota_max_storage_bytes` (default 100 MB).
- Tabel `site_usage_snapshots` untuk historical report (append-only, auto-pruned ke 100 terakhir).
- Endpoint `GET /sites/:id/usage` mengembalikan live + simpan snapshot.
- UI: bar `bg-emerald-500` (<70%), `bg-amber-500` (70-89%), `bg-red-500` (≥90%).

## Verifikasi Build

Setiap perubahan backend wajib lolos:

```bash
cd apps/api && go vet ./... && go build ./...
```

Setiap perubahan frontend pastikan typecheck OK. Tidak perlu start dev server otomatis kecuali user meminta.

## Don'ts

- ❌ Jangan tambah dependency tanpa cek dulu yang sudah ada di `go.mod` / `package.json`.
- ❌ Jangan ubah envelope response — klien (web/renderer) bergantung pada `{ data }` / `Paginated<T>`.
- ❌ Jangan interpolasi user input ke `ORDER BY` / `LIKE` tanpa whitelist / wildcard helper.
- ❌ Jangan hardcode brand color di renderer / exported CSS — pakai CSS variables.
- ❌ Jangan pakai emoji di code/file kecuali user minta. UI button emoji (📁, ↑, ↓, ⚙, ✕) OK karena sudah pola repo.
- ❌ Jangan tulis docstring panjang. Komentar maksimal 1-2 baris menjelaskan WHY.
- ❌ Jangan amend commit yang sudah ada — buat commit baru.
- ❌ Jangan auto-start dev server / docker compose tanpa user minta.

## Style Singkat

- File baru hanya jika benar-benar perlu. Prefer edit existing.
- Single responsibility per file (`storage_s3.go`, `storage_local.go` — bukan satu `storage.go` raksasa).
- Konsistensi naming: Go snake_case JSON tags, TS camelCase, slug huruf kecil + hyphen.
- Indonesian copy untuk user, English untuk dev tools (commit, log, comments).
