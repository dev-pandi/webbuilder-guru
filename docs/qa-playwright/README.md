# QA Playwright — Web Builder

Automated smoke + regression tests untuk web-builder pakai Playwright, hasil di-export ke **XLSX** (Excel) selain HTML + JSON standar Playwright.

Coverage: login per role, dashboard per role, halaman settings, admin panel, akses kontrol, health-check API.

**Status**: 169/169 tests hijau (`npm test` ~100 detik di lokal). Coverage:
- 56 baseline UI (auth + role dashboards)
- 61 security (OWASP 8/10) — RBAC, JWT, injection, idempotency, headers, payment integrity, audit log, SSRF, upload, rate limit
- 17 functional deep (pagination, wallet ledger integrity, E2E site publish)
- **30 negative** (input validation, boundary values, form UI, method restrictions)
- 5 visual regression (landing, login, dashboard, admin, wallet)

**Smoke suite**: 16 tests, ~8 detik — jalan tiap PR (block merge kalau fail).
**Regression**: full 139 tests, ~87 detik — nightly + on-demand.
**Multi-browser** (Firefox/WebKit): opt-in via `PLAYWRIGHT_BROWSERS=all npm run test:cross-browser`, filter grep `@cross-browser`.

## Prasyarat

- Node **20.6+** (`node --env-file` native support). Recommended 22.x atau 23.x.
- Backend web-builder + dashboard + renderer sudah jalan (`docker compose up` di `infra/`, atau native dev).
- **Empat akun test pre-existing** di DB — satu per role:
  - `client@example.com` (role: `client`)
  - `agent@example.com` (role: `agent`)
  - `reseller@example.com` (role: `reseller`)
  - `admin@example.com` (role: `admin`)

  Bootstrap admin: `ADMIN_EMAIL` + `ADMIN_PASSWORD` env di API. Sisanya bikin manual via `/admin/users` atau seeder demo (`SEED_DEMO=true`).

## Install

```bash
cd docs/qa-playwright
npm install
npm run install-browsers   # download Chromium ~150 MB (sekali saja)
```

## Konfigurasi

Copy env template lalu isi:

```bash
cp .env.example .env
```

Field penting:

| Var             | Default                        | Catatan                                              |
|-----------------|--------------------------------|------------------------------------------------------|
| `BASE_URL`      | `http://localhost:3000`        | URL dashboard Next.js                                |
| `API_BASE`      | auto-derive dari `BASE_URL`    | Localhost → `:8080`, remote → `api.<host>`           |
| `CLIENT_EMAIL`  | `client@example.com`           | Email akun client                                    |
| `CLIENT_PASSWORD` | `changeme123`                | Password client                                      |
| `AGENT_EMAIL` / `AGENT_PASSWORD`     | `agent@example.com` / `changeme123`      | Akun agent      |
| `RESELLER_EMAIL` / `RESELLER_PASSWORD` | `reseller@example.com` / `changeme123` | Akun reseller |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`     | `admin@example.com` / `changeme1234`     | Akun admin      |

## Menjalankan

```bash
# Split by priority
npm run test:smoke       # 16 tests, ~8 detik — critical path, CI PR gate
npm run test:regression  # 139 tests, ~87 detik — full suite, nightly
npm run test:visual      # 5 tests visual regression (baseline diff)
npm run test:visual:update  # update baseline (waktu design berubah)
npm run test:cross-browser  # @cross-browser tag di Firefox+WebKit

# Split by category
npm test                # alias regression (semua 139 tests)
npm run test:auth       # login flow (10 tests)
npm run test:client     # role client (9 tests)
npm run test:agent      # role agent (8 tests)
npm run test:reseller   # role reseller (11 tests)
npm run test:admin      # role admin (18 tests)
npm run test:security   # OWASP 8/10 (61 tests) — A01/A02/A03/A04/A05/A08/A09/A10
npm run test:functional # deep functional (17 tests) — pagination, wallet, E2E publish
npm run test:negative   # negative testing (30 tests) — malformed input + boundary + UI form

npm run test:headed     # tampilkan browser (debug UI)
npm run test:ui         # Playwright UI mode (record + replay + timeline)
npm run report          # buka HTML report di browser
```

Filter test tertentu:

```bash
node --env-file=.env node_modules/.bin/playwright test --grep "Login sebagai admin"
```

## Hasil

Setiap run menghasilkan 4 output di `results/`:

| File                                  | Format | Isi                                                        |
|---------------------------------------|--------|------------------------------------------------------------|
| `qa-report-YYYYMMDDHHMMSS.xlsx`       | Excel  | Report ber-timestamp (arsip)                               |
| `qa-report-latest.xlsx`               | Excel  | Copy dari file terbaru (untuk CI upload)                   |
| `html-report/index.html`              | HTML   | Playwright interactive report (screenshot + video + trace) |
| `report.json`                         | JSON   | Raw hasil (untuk parsing custom)                           |

### Struktur Excel (4 sheet)

1. **Summary** — total pass/fail/skip, durasi, timestamp.
2. **All Tests** — 1 baris per test dengan kolom:
   - `#`, `Role`, `Test Name`
   - **`Expected (Requirement)`** — kriteria yang di-assert (dari `req()` di test)
   - **`Actual (Result)`** — hasil observasi konkret (dari `act()` di test)
   - `Status` (color-coded), `Duration (ms)`, `Retry`
3. **Failed Tests** — filter isi test yang fail — untuk quick triage.
4. **Per Role** — breakdown pass/fail per suite (auth, client, agent, reseller, admin).

Contoh baris di sheet **All Tests**:

| Test Name                            | Expected                                                                    | Actual                                                                       | Status |
|--------------------------------------|-----------------------------------------------------------------------------|------------------------------------------------------------------------------|--------|
| Login sebagai admin berhasil...      | POST /auth/login sebagai admin → access_token (>20 char) + dashboard 2xx    | access_token length=308, GET /admin → 200, main tampil                       | PASSED |
| API GET /admin/stats return 200      | GET /api/v1/admin/stats + Bearer admin token → HTTP 200 + response.data     | HTTP 200, data keys: [user_count, admin_count, active_resellers, ...]        | PASSED |
| API GET /admin/users pagination      | GET /api/v1/admin/users?page=1&page_size=5 → HTTP 200 + envelope {data}     | HTTP 200, items.length=5, total=5                                             | PASSED |

Auto-filter di header + frozen row 1 supaya scroll tetap nyaman.

### Menulis requirement + actual di test baru

Import helper `req` + `act` dari `fixtures/qa.mjs`, panggil dengan `testInfo`:

```javascript
import { test, expect } from "@playwright/test";
import { req, act } from "../fixtures/qa.mjs";

test("Halaman X loads", async ({ page }, testInfo) => {
  req(testInfo, "GET /route/x → HTTP <400 + main visible + <table> muncul");

  const res = await page.goto("/route/x");
  const status = res?.status();
  await expect(page.locator("main")).toBeVisible();
  const rowCount = await page.locator("table tbody tr").count();

  act(testInfo, `HTTP ${status}, tabel muncul, ${rowCount} row terdeteksi`);
});
```

`req` = kriteria yang di-assert (behavior spec). `act` = hasil observasi konkret (angka, path final, response body key). Report Excel akan comparable — bukan cuma "pass/fail" tanpa konteks.

## Arsitektur

```
docs/qa-playwright/
  fixtures/
    accounts.mjs           # config akun + deriveApiBase()
    auth.mjs               # loginAs() dengan token cache module-level
  reporters/
    excel-reporter.mjs     # Custom Playwright reporter → XLSX
  tests/
    01-auth.spec.mjs       # Login per role + endpoint public
    10-client.spec.mjs     # Dashboard client, settings, wizard domain
    20-agent.spec.mjs      # Dashboard agent + halaman clients/invoices/wallet
    30-reseller.spec.mjs   # Dashboard reseller + team + wallet + pricing
    40-admin.spec.mjs      # Admin panel lengkap + API health
  playwright.config.mjs    # Custom reporter + retries=0 lokal
  package.json
  .env.example
```

### Kenapa token cache?

Fiber rate-limit `POST /auth/login` = **5 req/menit per IP**. QA suite login 4 role × ~50 test = ratusan hit. Tanpa cache, 429 setelah beberapa test pertama.

Solusi: `fixtures/auth.mjs` cache access_token di `Map<role, token>` module-level. TTL cache 10 menit (< JWT TTL 15m). Reset otomatis kalau test suite dijalankan ulang di process baru.

Kalau lu run `npm test` back-to-back terlalu cepat, tetap bisa kena 429 karena cache reset per process. Solusinya: tunggu ~60 detik atau naikin `AUTH_LOGIN_RATE_LIMIT_MAX` di API config buat CI environment.

### Kenapa retries=0 lokal?

Default Playwright retries=1 di lokal. Kalau test fail karena rate-limit, retry-nya juga fail dan cuma buang waktu. CI dapet retries=1 (`process.env.CI` truthy).

## Menambah test baru

1. Bikin file `tests/NN-<name>.spec.mjs`. Prefix numeric supaya urutan run deterministic.
2. Import `loginAs` dari `../fixtures/auth.mjs`. Panggil di `test.beforeEach` — token akan cached, aman hit ratusan test.
3. Assertion favorit di web-builder ini: `await expect(page.locator("main")).toBeVisible();` — bukti page rendered tanpa 404/redirect.
4. Untuk halaman yang butuh data spesifik, set `SAMPLE_SITE_ID` / `SAMPLE_DOMAIN` di `.env` supaya test URL bisa deep-link.

## Integrasi CI (sudah live)

File workflow production-ready ada di [.github/workflows/qa-playwright.yml](../../.github/workflows/qa-playwright.yml). Struktur:

- **`smoke` job** — jalan tiap PR ke `main`, timeout 10 menit, block merge.
- **`regression` job** — jalan nightly `cron: '0 3 * * *'` (10:00 WIB), timeout 45 menit.
- **`visual` job** — jalan nightly + workflow_dispatch, cross-browser (chromium+firefox+webkit), upload diff artifact kalau fail.

Secrets yang dibutuhkan di GitHub repo settings:
- `QA_CLIENT_EMAIL/PASSWORD`, `QA_AGENT_*`, `QA_RESELLER_*`, `QA_ADMIN_*` (fallback ke default kalau kosong)
- `SLACK_WEBHOOK_URL` (optional — untuk notify nightly regression failure)

Contoh manual dispatch:
```bash
gh workflow run qa-playwright.yml --field mode=smoke        # atau regression / visual
```

### Contoh workflow rumah tangga:

```yaml
name: QA Playwright
on: [push, pull_request]
jobs:
  qa:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: test }, ports: ["5432:5432"] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - name: Start backend + web + renderer
        run: docker compose -f infra/docker-compose.yml up -d
      - name: Wait for services
        run: until curl -sf http://localhost:8080/healthz; do sleep 2; done
      - name: Install QA
        working-directory: docs/qa-playwright
        run: |
          npm ci
          npx playwright install --with-deps chromium
      - name: Run QA
        working-directory: docs/qa-playwright
        env:
          BASE_URL: http://localhost:3000
          API_BASE: http://localhost:8080
          CLIENT_EMAIL: ${{ secrets.QA_CLIENT_EMAIL }}
          CLIENT_PASSWORD: ${{ secrets.QA_CLIENT_PASSWORD }}
          # ... dst per role
        run: npm test
      - name: Upload Excel report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: qa-report
          path: docs/qa-playwright/results/qa-report-latest.xlsx
```

## Troubleshooting

**`browserType.launch: Executable doesn't exist`** — run `npm run install-browsers`.

**`Login <role> failed (429)`** — rate limit. Tunggu 60 detik, atau naikin limit di API. Cache token di `auth.mjs` sudah aktif; kalau masih hit 429, kemungkinan lu run `npm test` berkali-kali dalam < 1 menit.

**`.env` tidak ke-load** — pastikan pakai `npm test` (bukan `npx playwright test` langsung). Script `npm test` inject `--env-file` ke Node.

**Test fail semua dengan `net::ERR_CONNECTION_REFUSED`** — backend belum jalan. Cek `curl http://localhost:8080/healthz`.

**Test halaman fail dengan `main` not visible** — kemungkinan route belum ada di dashboard, atau route memerlukan data yang belum di-seed. Cek `apps/web/app/<role>/` untuk route yang valid.
