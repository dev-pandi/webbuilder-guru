# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Konteks ini dimuat di setiap sesi. Bekerjalah sebagai senior engineer dengan keahlian gabungan:

## Peran & Skill

- **Go (Fiber) profesional** — REST API produksi, pgx/v5 dengan parameterized query, JWT, argon2id, migrations embedded, layered architecture (handler/repo per domain).
- **UI/UX profesional** — modern, clean, professional, fully responsive. Mobile-first, breakpoints sm/md/lg konsisten, whitespace generous, microcopy ramah bahasa Indonesia.
- **TailwindCSS + shadcn/ui** — utility-first, accessible Radix primitives, dark-on-light defaults. Komponen shadcn di-vendor di `apps/web/components/ui/` (button, card, input, label, badge, dialog, select, table, tabs, textarea, progress, separator). Helper `cn()` di `lib/utils.ts`. Pakai lucide-react untuk ikon.
- **Web builder** — block-based editor (skema JSON tree), multi-tenant rendering by Host, custom domain + SSL, export ke static HTML/CSS/JS, asset library, theme tokens (CSS variables).
- **Next.js 14 (App Router)** — RSC + client components (`"use client"`), route groups `(group)`, dynamic segments `[id]`, metadata, server-only fetch dengan `force-dynamic` untuk renderer.
- **Caddy** — reverse proxy, on-demand TLS dengan ask endpoint, multi-host routing untuk dashboard / api / renderer / custom domain user.

Bahasa user-facing copy: **Indonesia**. Komentar code: English ringkas yang menjelaskan WHY (bukan WHAT).

## Tech Stack

| Layer | Tools |
|-------|-------|
| Backend | Go 1.24 (toolchain 1.24.3), Fiber v2, jackc/pgx v5, golang-jwt v5, argon2id, minio-go v7, Goose v3 |
| Frontend | Next.js 14 (App Router), TypeScript 5.5, Tailwind 3.4, React 18, @dnd-kit (editor DnD), TipTap 2 (rich text) |
| DB | PostgreSQL 16. Migrations embedded di `apps/api/internal/db/migrations/`, auto-applied via `goose_db_version` table |
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
- **shadcn-first**: untuk komponen umum (Button, Card, Input, Label, Badge, Dialog, Select, Table, Tabs, Progress, Separator) **wajib** pakai komponen dari `@/components/ui/*`. Jangan tulis utility class custom yang sudah ada equivalent shadcn.
- **Ikon**: pakai lucide-react (`import { Plus, Pencil } from "lucide-react"`). Jangan pakai emoji untuk ikon yang punya equivalent lucide.
- **Color tokens**: pakai shadcn semantic (`bg-primary`, `text-muted-foreground`, `border`, `bg-card`, `text-destructive`). `brand-*` dan slate explicit hanya untuk legacy yang belum di-port.
  - Status semantic mapping: `published` → Badge `variant="success"`; `draft`/`pending` → `secondary`; `verified` → `success`; `failed`/danger → `destructive`; admin/warning → `warning`.
- **Cards**: `<Card>` + `<CardHeader>` + `<CardTitle>` + `<CardContent>`. Untuk tabel full-bleed: `<Card className="overflow-hidden p-0">`.
- **Dialog**: `<Dialog open={open} onOpenChange={setOpen}>` + `<DialogContent>` + `<DialogHeader><DialogTitle>...<DialogDescription>` + `<DialogFooter>`. Tombol close (X) sudah included.
- **Form**: `<Label htmlFor>` + `<Input id>` + `space-y-1.5` di wrapper. Error message: `<p className="text-sm text-destructive">`.
- **Tabs nav (header level)**: pakai `<Link>` dengan `border-b-2` pattern di `apps/web/app/sites/[id]/layout.tsx` (bukan Radix Tabs — untuk navigasi route).
- **Loading**: dim tabel `className={loading ? "opacity-60" : ""}` di `<TableBody>`. Skeleton: `animate-pulse rounded-md bg-muted/50`.
- **Empty states**: copy berbeda untuk "belum ada data" vs "tidak ada hasil untuk \"X\"".
- **Live search**: `useDebounced` dari `components/Pagination.tsx` (300ms default), reset `page=1` saat query atau sort berubah.
- **Theme tokens** (untuk situs yang di-render, BUKAN dashboard) mengalir ke renderer via CSS variables (`--color-primary`, `--font-heading`, `--radius`). JANGAN hardcode `brand-*` di renderer atau exported CSS.

## Konvensi Go

- **Layered**: repo punya SQL, handler punya validasi + auth + dispatch. Handler TIDAK menulis SQL.
- **Sentinel errors** per package: `ErrNotFound`, `ErrSlugTaken`, `ErrLimitReached`. Bandingkan dengan `errors.Is`.
- **Constructor**: `NewRepo(pool)` / `NewHandler(repo, ...)` — injected, tanpa global state.
- **Pgx**: selalu `defer rows.Close()` setelah `pool.Query`, dan return `rows.Err()` di akhir loop.
- **Generics** untuk shared types: `Paginated[T]`, `MakePaginated[T]`.
- **Unique violation**: cek `pgErrCode(err) == "23505"` → return sentinel `Err*Taken`.
- **JSON null handling**: pointer field untuk optional input (`*string`, `*int`), `COALESCE($n, col)` di UPDATE.

## Environment Files

Empat file `.env.example` terpisah agar tiap workflow jelas isinya:

| File                          | Workflow                                          |
|-------------------------------|---------------------------------------------------|
| `infra/.env.example`          | Docker Compose orchestration (`cd infra && docker compose up`) |
| `apps/api/.env.example`       | Go API direct dev (`go run ./cmd/server`)         |
| `apps/web/.env.example`       | Next.js dashboard dev (`npm run dev`)             |
| `apps/renderer/.env.example`  | Next.js renderer dev (`npm run dev`)              |

Aturan saat menambah env baru:
- API baca dari OS env → daftarkan di [config/config.go](apps/api/internal/config/config.go) + dokumentasikan di `apps/api/.env.example` + jika perlu passthrough Docker, tambahkan di `infra/docker-compose.yml` (env `${VAR:-default}`) + di `infra/.env.example`.
- Frontend env publik (browser-visible) **wajib** prefix `NEXT_PUBLIC_` dan masuk ke `apps/web/.env.example`.
- Renderer server-to-server env (tanpa `NEXT_PUBLIC_`) masuk ke `apps/renderer/.env.example`.
- Jangan duplikasi env di banyak file kalau tidak perlu — user bingung mana yang authoritative.

Next.js auto-load `.env.local` (jangan commit). API perlu `.env` di dir tempat `go run` dijalankan + dotenv loader/`source`.

## Migrations

- **Goose v3** (`github.com/pressly/goose/v3@v3.21.1`) untuk schema migrations. Library mode, embedded via `embed.FS`, auto-applied saat startup.
- File baru: `apps/api/internal/db/migrations/NNNN_description.sql` dengan format goose:
  ```sql
  -- +goose Up
  CREATE TABLE IF NOT EXISTS ...;

  -- +goose Down
  DROP TABLE IF EXISTS ...;
  ```
- Idempotent saat memungkinkan: `CREATE TABLE/INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS` di Down.
- Multi-statement function/DO block butuh `-- +goose StatementBegin` / `-- +goose StatementEnd`.
- Tracking: `goose_db_version` table.
- Legacy compat: `internal/db/migrate.go::importLegacyMigrationState` otomatis migrasi dari `schema_migrations` (custom runner lama) ke `goose_db_version` pada startup pertama setelah upgrade.
- JANGAN edit migration yang sudah di-apply — selalu buat file baru.

## Seed

- Package `apps/api/internal/seed/` (idempotent, dipanggil dari `main.go` setelah migrate).
- `seed.Run(ctx, Deps, Options)` mengeksekusi:
  - **`Templates`** — selalu jalan, upsert 15 built-in template dari `templates.BuiltinTemplates()`.
  - **`Admin`** — jalan kalau `ADMIN_EMAIL` + `ADMIN_PASSWORD` set. Idempotent: kalau user sudah ada, hanya force role=admin, password tidak diubah.
  - **`Demo`** — opt-in via `SEED_DEMO=true`. Buat 1 user demo + 1 situs UMKM + 5 produk + 3 artikel blog Markdown. Skip total kalau user demo sudah ada.
- Tambah seeder baru = tambah function di `seed.go` + panggil dari `Run`.

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

Perintah yang dijalankan CI (`.github/workflows/ci.yml`) — cocokkan lokal sebelum commit.

**API (Go)** — wajib lolos untuk semua perubahan backend:

```bash
cd apps/api
go vet ./...
go build ./...
go test -race -timeout 90s ./...            # semua paket
go test -race -run TestName ./internal/pkg  # single test / paket tertentu
```

Integration test yang butuh Postgres: set `TEST_DATABASE_URL` (contoh:
`postgres://test:test@localhost:5432/webbuilder_test?sslmode=disable`). Kalau
kosong, test SKIP otomatis. CI selalu set (Postgres service di
[.github/workflows/ci.yml](../.github/workflows/ci.yml)).

**Dashboard (Next.js)**:

```bash
cd apps/web
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run build        # next build (butuh NEXT_PUBLIC_API_BASE)
```

**Renderer (Next.js)**:

```bash
cd apps/renderer
npm run typecheck
npm run build        # butuh API_URL
```

Tidak perlu start dev server otomatis kecuali user minta. Kalau perlu dev:
`go run ./cmd/server` (API), `npm run dev` (web), `npm run dev -- -p 3001` (renderer).

## Editor Internals (apps/web/app/sites/[id]/editor/)

Block tree adalah `BlockData[]` (JSON) dengan bentuk `{ type, props, children?, layout?, themeOverride? }`. Semua operasi tree **immutable & path-based** — path = array of sibling indices (`[3, 0, 1]` = anak ke-2 dari anak ke-1 top-level block #3).

- **[paths.ts](../apps/web/app/sites/[id]/editor/paths.ts)** — SATU-SATUNYA sumber untuk mutasi tree. Fungsi: `getAt`, `updateAt`, `removeAt`, `removeMany`, `insertAt`, `duplicateAtPath`, `moveAtPath`, `reorderSiblings`, `movePath`, `pathKey`/`keyToPath` (Set membership + React keys), `samePath`, `isChildOf`. **Semua return tree baru** dengan hanya spine yang di-copy → memo React tetap valid.
- `movePath` menolak drop ke sub-tree diri sendiri (mencegah orphan). `removeMany` sort deepest-first supaya index-shift tidak melenceng.
- **[PropEditor.tsx](../apps/web/app/sites/[id]/editor/PropEditor.tsx)** — schema-driven form per block type. Blok baru = tambah schema + renderer di sini.
- **[SortableBlockList.tsx](../apps/web/app/sites/[id]/editor/SortableBlockList.tsx)** — @dnd-kit sortable, panggil `reorderSiblings`/`movePath`.
- **[useBlocksHistory.ts](../apps/web/app/sites/[id]/editor/useBlocksHistory.ts)** — undo/redo stack, kapasitas fixed.

Ketika menambah tipe blok baru, sentuh berurutan: (1) schema di `PropEditor`, (2) renderer di `apps/renderer/app/[...slug]/page.tsx` block dispatch, (3) exporter di `apps/api/internal/exports/`, (4) `styles.go` (CSS) kalau butuh class `.wb-*` baru.

## Renderer (apps/renderer)

- **Route tunggal**: `app/[...slug]/page.tsx` — catch-all yang lookup `Host` header → `GET /public/site-by-host?host=...` → `GET /public/sites/:id/pages/:slug` (slug kosong = `_home`).
- **ISR**: `export const revalidate = 30` di page — cache 30 detik per Host+path.
- **Preview**: `_preview/*` route untuk draft (bypass publish, dari dashboard iframe).
- **Dynamic blocks**: `ProductGridDynamic`, `BlogListDynamic` fetch dari `/public/sites/:id/products` & `/blog` — jangan hard-code data.
- **Theme tokens** dari site JSON diinject sebagai CSS variables di `<style>` inline di layout (`--color-primary`, `--font-heading`, `--radius`). Blok pakai `var(--color-primary)`, bukan `bg-primary` Tailwind class.

## Domain Purchase Flow (registrar integration)

**Konsep produk**: **1 domain = 1 situs**. User HARUS beli domain dulu sebelum bisa create situs — tidak ada free subdomain flow. `POST /sites/from-template/:slug` wajib `job_id` di body; atomic create + attach.

**Arsitektur**:
- Web builder API = **transparent proxy** ke `registrar-api` (Go/Gin di `/Users/pandi-rofai/Project/Golang/registrar-api`).
- Dokumen sensitif (KTP/NPWP) **TIDAK disimpan di web builder** — multipart di-forward langsung ke registrar. Single source of truth = registrar (menghindari duplikasi PII).
- Client wrapper: [apps/api/internal/registrar/](../apps/api/internal/registrar/) — `Client.CheckDomain / RegisterDomain / GetRegisterStatus / RetryDomain / RenewDomain / ListDomains / GetNameservers / UpdateNameservers / Whois / UploadDocumentForJob / Login / SetAPIKey`. `SetAPIKey` thread-safe (`sync.RWMutex`) untuk background refresh loop.
- Local job tracker: [apps/api/internal/domain_purchase/](../apps/api/internal/domain_purchase/) — mirror shallow dari `reseller_domain_jobs` di registrar, cache status + kind + expires_at + link ke `sites.id`.

**Auth ke registrar**: JWT reseller (30-day TTL). Dua mode:
- **Static**: `REGISTRAR_API_KEY` = JWT hasil login manual sekali. Operator harus rotate manual sebelum 30 hari.
- **Auto-refresh** (recommended prod): set `REGISTRAR_RESELLER_EMAIL` + `REGISTRAR_RESELLER_PASSWORD`. `main.go` login saat startup + refresh tiap 25 hari via background goroutine.

**Webhook**: registrar POST ke `/webhooks/registrar/domain-status` dengan HMAC signature (`X-Registrar-Signature: sha256=...`). Secret dari `REGISTRAR_WEBHOOK_SECRET` — set via `POST /v1/api/user/reseller/config/webhook` di registrar (return secret, salin ke env web builder).

**Env baru** (`apps/api/.env.example` + `infra/.env.example`):
- `REGISTRAR_API_URL` (kosong = fitur disabled)
- `REGISTRAR_API_KEY` (JWT statis, opsional kalau pakai credentials)
- `REGISTRAR_RESELLER_EMAIL` + `REGISTRAR_RESELLER_PASSWORD` (auto-login)
- `REGISTRAR_WEBHOOK_SECRET` (HMAC verify)
- `REGISTRAR_API_TIMEOUT` (default 15s)

**User flow end-to-end**:
1. Dashboard → **"Beli Domain + Buat Situs"** (satu-satunya CTA create — free subdomain flow sudah dihapus)
2. `/sites/new-with-domain` — wizard: cari domain → cek availability + harga + zone flags (`require_document`, `auto_approved`) → confirm dengan profile check (nama/HP/alamat/kota/kode pos + NIK kalau .id)
3. `POST /api/v1/domains/purchase` dengan header `Idempotency-Key: <uuid>` — proxy ke registrar → dapat `job_id` + `payment_url`
4. Navigate ke `/sites/pending/[jobId]` — polling 3s status:
   - `pending_payment` → tombol "Buka halaman pembayaran" (Midtrans/Paylabs)
   - `pending_document` → **DocumentUpload** multipart passthrough (file + category_id) ke registrar
   - `pending_provisioning` → wait EPP CREATE
   - `failed` → **tombol "Coba lagi"** (POST `/purchases/:job_id/retry` — TIDAK bayar ulang)
   - `active` → **TemplatePicker** → pilih template + slug → `POST /sites/from-template/:slug { job_id }` atomic create+attach → editor
5. Payment gateway redirect ke `/checkout/return` → auto ke `/sites/pending/<jobId>` (via `GET /purchases?limit=1`)
6. Dashboard poll `/domains/purchases` tiap 30s — kartu "Domain sedang diproses" update tanpa reload

**Sub-flow yang sudah live**:
- **Renew**: `POST /api/v1/domains/renew` → jobs bertype `kind=renew` dengan flow polling sama seperti register. UI reuse `/sites/pending/[jobId]` — kalau `kind=renew` template picker skipped, ganti dengan kartu "Perpanjangan berhasil".
- **Nameserver + WHOIS**: [/settings/domains/[name]](../apps/web/app/settings/domains/) — user edit NS (min 2, max 13, hostname regex client-side) + view WHOIS. Semua ownership-verified.
- **Sync**: `POST /api/v1/domains/sync` — user-triggered self-heal drift kalau webhook drop. Backend juga auto-run tiap 6 jam via goroutine `Handler.RunPeriodicSync` di [cmd/server/main.go](../apps/api/cmd/server/main.go).
- **Expiry email notifier**: [internal/notifier/expiry.go](../apps/api/internal/notifier/expiry.go) — background goroutine, scan tiap 24 jam. Kirim email peringatan per user (Bahasa Indonesia + deep-link `/settings/domains/<domain>`) untuk domain aktif expire ≤ 30 hari, dedup via kolom `expiry_notice_sent_at` + resend 7 hari.
- **Dashboard banner**: 2 kartu — "Domain sedang diproses" (pending states) + "Domain akan segera expire" (< 30 hari, sisa hari relative label). Filter dedupe per-domain (`latestActivePerDomain`) supaya post-renewal user tidak lihat tanggal lama.

**Yang harus dijaga saat kerja di area ini**:
- Ownership check di setiap endpoint (`GetByJobID(jobID, userID)` bukan `GetByJobID(jobID)`) — cegah URL guessing
- Idempotency-Key WAJIB di POST /purchase + /renew (frontend generate `useMemo` UUID) — cegah double-charge
- Error dari registrar dimap ke pesan ID di `friendlyError()` (wizard) — jangan expose "HTTP 403" mentah ke user
- Path registrar-api: `/v1/api/user/reseller/*` (bukan `/api/reseller/*` — pernah ada mismatch bug)
- **Dedupe expires_at per domain di frontend**: setelah renew, register-row punya expires_at lama, renew-row punya yang baru. Selalu pakai `latestActivePerDomain(items)` helper (di dashboard + settings/domains) — jangan filter `kind === "register"`.
- `lib/api.ts` throw `ApiError` (subclass Error dengan `.status` + `.code`) — pattern-match status 404/403 untuk friendly screen, bukan string-match message.

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
