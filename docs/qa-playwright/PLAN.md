# QA + Security Test Plan — Web Builder

**Author role assumption:** senior QA engineer + AppSec engineer.
**Product under test:** multi-tenant SaaS web-builder (Go Fiber API + Next.js dashboard/renderer + PostgreSQL + Caddy on-demand TLS).
**Baseline audit dari suite existing** ada di [README.md](README.md); dokumen ini adalah **rencana perbaikan + ekspansi** ke coverage produksi.

## Status eksekusi (2026-08-31)

| Phase | Deliverable | Status | Tests |
|---|---|---|---|
| P0 | Fix false positive + content-based assertion | ✅ Selesai | 56 (existing upgraded) |
| P1 | Security A01/A02/A04/A08 | ✅ Selesai | 22 |
| P2 | Pagination deep + wallet ledger + E2E publish | ✅ Selesai | 17 |
| P3 | Headers + injection + audit log | ✅ Selesai | 20 |
| P4 | SSRF + upload + rate limit | ✅ Selesai | 19 |
| P5 | Smoke/regression split + multi-browser + visual + CI | ✅ Selesai | 5 visual + CI |
| **Total** | | | **139 tests** (65-90 detik) |

**Smoke suite**: 16 tests, ~8 detik — jalan tiap PR.
**Regression suite**: 139 tests, ~87 detik — jalan nightly.
**Visual regression**: 5 halaman kunci, baseline generated di `tests/visual/*-snapshots/`.
**CI**: [.github/workflows/qa-playwright.yml](../../.github/workflows/qa-playwright.yml) dengan job smoke (PR) + regression (nightly) + visual (weekly).

---

## 1. Goals & non-goals

**Goals**
- Test **behavior** (data render, state transition, permission enforcement), bukan cuma "HTTP tidak 500".
- Cover **OWASP Top-10 2021** attack vectors yang relevan dengan surface produk ini.
- Setiap requirement punya **acceptance criteria konkret + observable actual** — report Excel harus bisa dibaca stakeholder non-teknis.
- **Deterministik**: tidak flaky, tidak tergantung state DB acak, tidak dependent order.
- **Fast feedback**: smoke suite ≤ 5 menit, full regression ≤ 30 menit.

**Non-goals**
- Load / stress testing (pakai `k6` / `wrk` — di luar plan ini).
- Penetration testing manual (butuh engagement khusus + rules of engagement).
- Fuzzing binary format (assets upload) — dedicated tooling.
- Chaos testing infra (network partition, DB failover).

---

## 2. Test pyramid + tooling

```
                     ┌──────────────┐
                     │  E2E UI (10) │  Playwright — user journeys end-to-end
                     └──────────────┘
                   ┌──────────────────┐
                   │  UI Component (25) │  Playwright — page × interaction
                   └──────────────────┘
              ┌────────────────────────────┐
              │  API Contract + Security (60) │  Playwright request fixture
              └────────────────────────────┘
        ┌────────────────────────────────────────┐
        │  Backend unit + integration (existing Go) │  `go test` (di apps/api)
        └────────────────────────────────────────┘
```

**Yang di-cover suite Playwright ini** (3 layer atas). Backend unit test tetap tanggung jawab `apps/api/**/*_test.go`.

Rasio target: 60% API/security, 30% UI component, 10% E2E — inverted pyramid untuk UI karena backend Go sudah punya coverage sendiri.

---

## 3. Functional coverage matrix

Format: **Feature × Role**. `✅` = must-have, `🟡` = nice-to-have, `—` = tidak berlaku.

### 3.1 Auth & session

| Test scenario                                                          | Client | Agent | Reseller | Admin |
|-------------------------------------------------------------------------|:------:|:-----:|:--------:|:-----:|
| Login valid → access + refresh token diterima + shape sesuai            |   ✅   |  ✅   |    ✅    |  ✅   |
| Login invalid credential → 401, tidak leak "user not found" vs "wrong pw" |   ✅   |  —   |    —    |  —   |
| Rate limit `/auth/login` — 6 request cepat → request ke-6 dapat 429     |   ✅   |  —   |    —    |  —   |
| Refresh token rotation — old refresh revoked setelah refresh            |   ✅   |  —   |    —    |  —   |
| Logout → refresh token blacklisted (POST /refresh dengan old = 401)    |   ✅   |  —   |    —    |  —   |
| Access token expiry 15 menit — waktu tempered → 401                     |   ✅   |  —   |    —    |  —   |
| `/auth/me` tanpa token → 401 dengan error envelope `{ error: { code } }` |   ✅   |  —   |    —    |  —   |
| CORS preflight untuk `/api/v1/*` return allowed origin sesuai config    |   ✅   |  —   |    —    |  —   |

### 3.2 Site + editor + publish flow

| Test scenario                                                          | Client | Agent | Reseller | Admin |
|-------------------------------------------------------------------------|:------:|:-----:|:--------:|:-----:|
| Create site dari template — tree ter-copy, page count = template page count |   ✅   |  ✅   |    ✅    |  🟡   |
| Edit block prop (Heading text) → save → GET page tree berisi update    |   ✅   |  —   |    —    |  —   |
| Drag-reorder block → save → order sesuai                                |   ✅   |  —   |    —    |  —   |
| Undo/redo — 3 edit → 3 undo → tree back to original                    |   🟡   |  —   |    —    |  —   |
| Publish site → renderer route `/` dengan Host header → HTML berisi block content |   ✅   |  —   |    —    |  —   |
| Theme color update → CSS variable `--color-primary` di renderer match  |   ✅   |  —   |    —    |  —   |
| Preview token (HMAC signed) buka draft di iframe — expired token → 401 |   ✅   |  —   |    —    |  —   |

### 3.3 Domain purchase + renewal + WHOIS

| Test scenario                                                          | Client | Agent | Reseller | Admin |
|-------------------------------------------------------------------------|:------:|:-----:|:--------:|:-----:|
| Cek availability `.id` → response body `{ available: true/false, price }` — bukan hanya status 200 |   ✅   |  —   |    ✅    |  —   |
| Purchase domain flow — POST /purchase → invoice created → job status `pending_payment` |   ✅   |  —   |    ✅    |  —   |
| Idempotency-Key duplicate — 2 request identik dengan same key → 1 invoice created |   ✅   |  —   |    —    |  —   |
| Payment webhook (mocked) → job status jadi `active` + domain terlihat di list |   ✅   |  —   |    —    |  —   |
| Renew domain — pre: expires_at Y, post-webhook: expires_at Y+1         |   ✅   |  —   |    ✅    |  —   |
| Nameserver update — POST NS baru → GET whois berubah                   |   ✅   |  —   |    —    |  —   |
| Promo code apply — subtotal 100k, kupon 10% → total 90k                |   ✅   |  —   |    —    |  —   |
| Promo code redeem race — 2 request paralel → 1 sukses, 1 gagal 409     |   —   |  —   |    —    |  ✅   |

### 3.4 Wallet, invoice, payment

| Test scenario                                                          | Client | Agent | Reseller | Admin |
|-------------------------------------------------------------------------|:------:|:-----:|:--------:|:-----:|
| Reseller wallet top-up flow — request 500k → invoice unpaid → mark paid → ledger +500k |   —    |  —   |    ✅    |  —   |
| Reseller wallet debit for purchase — balance turun sesuai harga        |   —    |  —   |    ✅    |  —   |
| Wallet ledger append-only — GET ledger paginated + sum = current balance |   —   |  —   |    ✅    |  ✅   |
| Client TIDAK bisa top-up wallet (403 di /wallet/topup)                  |   ✅   |  —   |    —    |  —   |
| Admin adjust wallet — write ke ledger + audit log entry                |   —    |  —   |    —    |  ✅   |
| Invoice PDF download — response content-type application/pdf, magic bytes `%PDF-` |   ✅   |  ✅   |    ✅    |  ✅   |

### 3.5 Pagination, search, sort (regression prone)

| Test scenario                                                          | Coverage         |
|-------------------------------------------------------------------------|------------------|
| GET /admin/users?page=1&page_size=5 → `items.length ≤ 5`, `total > 0` | ✅ all-role list |
| GET /admin/users?page=999 → items = []                                | ✅               |
| GET /admin/users?q=admin → semua item.email/name mengandung "admin"    | ✅               |
| GET /admin/users?sort=created_at.desc → item[0].created_at ≥ item[1]  | ✅               |
| GET dengan sort field yang tidak whitelist → default sort, tidak SQL error | ✅ security  |
| UI klik "Next page" → URL query `?page=2` + row berbeda dari page 1    | 🟡               |

---

## 4. Security test matrix (OWASP Top-10 2021 mapping)

Setiap kategori maps ke attack vector spesifik produk ini.

### A01 — Broken Access Control (highest priority)

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A01-1 | Client GET `/api/v1/admin/*` → 403                                                    | Response 403                |
| A01-2 | Agent PATCH `/api/v1/admin/sites/:id/quota` → 403                                     | Response 403                |
| A01-3 | User A ambil site_id user B → GET `/sites/<other-id>` → 404 (bukan 200 leak)          | Response 404                |
| A01-4 | User A ambil invoice_id user B → GET `/invoices/<other-id>` → 404                      | Response 404                |
| A01-5 | Agent buat purchase atas nama client tanpa assignment aktif → 403                      | Response 403                |
| A01-6 | Reseller ambil client user reseller lain via GET /reseller/clients/:id → 404          | Response 404                |
| A01-7 | Preview token (HMAC) valid untuk page A, coba akses page B → 401                       | Response 401                |
| A01-8 | Custom domain hijack — POST /domains/attach dengan domain milik user lain → 409/403    | Response 409 atau 403       |

### A02 — Cryptographic Failures

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A02-1 | JWT dengan `alg=none` → 401                                                            | Response 401                |
| A02-2 | JWT tampered signature (flip 1 byte) → 401                                             | Response 401                |
| A02-3 | JWT expired (backdated exp) → 401                                                      | Response 401                |
| A02-4 | Password login response body TIDAK berisi hash password / raw refresh                  | Body inspection             |
| A02-5 | Preview HMAC token entropy — panjang ≥ 30 char, base64                                | Length + charset check      |

### A03 — Injection (SQLi / XSS / template)

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A03-1 | GET `/admin/users?q=' OR 1=1--` → tidak return semua user, response tetap valid       | items.length filter normal  |
| A03-2 | GET `/admin/users?sort=id;DROP TABLE users` → 400 atau default sort, DB tetap OK      | 400 / default order         |
| A03-3 | POST site.name = `<script>alert(1)</script>` → dashboard render escaped               | textContent bukan HTML      |
| A03-4 | POST page.title = `<img onerror=alert(1)>` → renderer output escaped di `<title>`     | HTML escaped                |
| A03-5 | `custom_head_code` sengaja unsanitized (fitur GTM/pixel) — dokumentasikan risk, test bahwa **hanya owner site** bisa set field ini (bukan collaborator read-only) | Only owner |

### A04 — Insecure Design

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A04-1 | Purchase tanpa Idempotency-Key header → 400                                            | Response 400                |
| A04-2 | Purchase dengan Idempotency-Key duplicate → 1 invoice, response return existing job    | 1 row di DB                 |
| A04-3 | Wallet payment untuk client role → 403 (hanya reseller/agent)                          | Response 403                |
| A04-4 | Quota exceed — buat page ke-21 di site quota 20 → 403 dengan pesan quota             | 403 + specific error code   |

### A05 — Security Misconfiguration

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A05-1 | HTTP header response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` di dashboard | Header assertion  |
| A05-2 | `Set-Cookie` (kalau ada session) mengandung `HttpOnly; Secure; SameSite=Lax`         | Header assertion            |
| A05-3 | `GET /debug/pprof` di prod-mode → 404 (bukan enabled)                                  | Response 404                |
| A05-4 | Error 500 tidak leak stack trace / SQL query di body                                   | Body regex assertion        |

### A07 — Identification & Authentication Failures

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A07-1 | Bruteforce — 20 login attempt dengan password beda → rate limit kick in                | 429 di attempt ke-6         |
| A07-2 | Password reset flow (kalau ada) — token single-use, tidak reusable                     | 2nd use → 400               |
| A07-3 | Register endpoint (kalau public) — email format validation                            | Invalid email → 400         |

### A08 — Software & Data Integrity Failures

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A08-1 | Payment webhook signature invalid → 401 dan invoice tidak ke-mark paid               | Invoice status unchanged    |
| A08-2 | Payment webhook replay (same body 2× dalam 5 menit) → 2nd request 409 atau idempotent | No double credit           |
| A08-3 | Assets upload — filename `../../etc/passwd` → 400 atau sanitized ke basename          | Path traversal blocked      |
| A08-4 | Assets upload — file magic bytes tidak match extension (rename `.php` → `.png`) → detect via mime check | 400 |
| A08-5 | Assets upload — file size > quota → 413 dan tidak dihitung ke storage_bytes           | 413 + quota unchanged       |

### A09 — Logging & Monitoring Failures

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A09-1 | Admin action (promote user, delete site) → audit_log entry berisi actor + target      | DB query verification       |
| A09-2 | Login failure → tercatat di audit log (untuk detect brute-force pattern)               | DB query verification       |
| A09-3 | Payment webhook received → tercatat di email_log / payment_webhook_log                | DB query verification       |

### A10 — Server-Side Request Forgery (SSRF)

| # | Attack scenario                                                                        | Expected                    |
|---|----------------------------------------------------------------------------------------|-----------------------------|
| A10-1 | Custom domain verify — POST domain `169.254.169.254` (AWS metadata) → DNS lookup blocked | 400 |
| A10-2 | Caddy `/internal/caddy/ask?domain=localhost` → 403 (localhost tidak boleh)             | Response 403                |
| A10-3 | Image URL importer (kalau ada) — URL `file:///etc/passwd` → 400                        | Response 400                |

---

## 5. Test data & fixture strategy

**Masalah sekarang**: test asumsi DB punya data (5 invoice, 3 site, dst). Fresh install → banyak test false-green karena 0-row lolos assertion `<table>` visible.

**Solusi**: **QA seeder module** — idempotent, jalan sebelum suite. Bikin package `apps/api/internal/seed/qa/` atau via SQL fixture di `docs/qa-playwright/fixtures/seed.sql`.

### 5.1 Fixture invariant yang harus di-guarantee

| Entity           | Minimum count | Owner              | Catatan                                    |
|------------------|--------------:|--------------------|--------------------------------------------|
| Users            | 4             | -                  | Satu per role                               |
| Sites            | 2             | client, reseller   | 1 published, 1 draft                        |
| Pages            | 6             | across sites       | Home + 2 sub per site                        |
| Domains          | 3             | client (2), reseller (1) | 1 active, 1 expiring 30d, 1 pending      |
| Invoices         | 5             | mixed              | 2 paid, 2 unpaid, 1 draft                    |
| Wallet balance   | Rp 1jt        | reseller           | Ledger 3 entry                              |
| Templates        | 15            | admin              | Sudah ada dari `templates.BuiltinTemplates` |
| Promo codes      | 2             | admin              | 1 active percent, 1 fixed                    |
| Documents (KTP)  | 1             | client             | Untuk purchase .id TLD                      |

### 5.2 Cleanup strategy

- **Preferensi**: idempotent seeder — test pakai fixed IDs (`SEED_CLIENT_ID=00000000-0000-4000-8000-000000000001`) supaya assertion bisa deep-link.
- **Anti-pattern**: `beforeEach` truncate table (lambat + rusak paralelisme).
- **Rollback**: transaksi test (kalau backend expose test-only `/qa/txn/begin` endpoint) — advanced, phase 3.
- **Mutation test isolation**: test yang bikin data baru harus tag dengan prefix `qa-<timestamp>-*` supaya bisa di-cleanup batch.

---

## 6. Execution phases

### Phase P0 — Fix current false positives (1 hari)

Deliverable: report Excel tidak lagi berbohong.

- [ ] Hapus assertion `if btn exists then check` di reseller wallet top-up — ganti dengan `expect(btn).toBeVisible()` tegas atau hapus test.
- [ ] Perbaiki `01-auth › Login credential salah` — kalau 429, retry after 60s, jangan accept 429 sebagai pass.
- [ ] Perbaiki `10-client › Cek availability domain` — assert hasil card dengan konten valid (price atau "tidak tersedia"), bukan "error alert OR result".
- [ ] Assertion tabel berisi minimum row (dari fixture) — bukan cuma `<table>` visible.

Success criteria: report Excel Actual column berisi data konkret (`items.length=5, total=127, invoice-1 amount=Rp 150.000`), bukan `HTTP 200, main tampil`.

### Phase P1 — Security-critical (2 hari)

Deliverable: A01 + A02 + A08 fully covered (paling sering exploit di produk SaaS).

- [ ] Buat file `tests/security/01-authz.spec.mjs` — semua scenario tabel §4 A01 (8 test).
- [ ] Buat file `tests/security/02-jwt.spec.mjs` — A02-1 s/d A02-3 (JWT tampering).
- [ ] Buat file `tests/security/03-payment-integrity.spec.mjs` — A08-1, A08-2 (webhook signature + replay).
- [ ] Buat file `tests/security/04-idempotency.spec.mjs` — purchase double-charge prevention.

Success criteria: 100% test lulus tanpa flake 3 run beruntun. Fail cases (misal: A03-3 XSS di renderer) MUST fail sampai backend patch — jangan skip.

### Phase P2 — Functional deep dives (2 hari)

Deliverable: coverage §3.2, §3.3, §3.4 substantial.

- [ ] E2E "Buat site → edit block → save → publish → render match" (1 test, ~30 detik).
- [ ] E2E "Purchase domain via wallet → active → renew → expires_at bertambah 1 tahun" (1 test dengan mock payment webhook).
- [ ] Pagination + search + sort di 3 tabel (admin/users, admin/invoices, settings/domains) — masing-masing 3 assertion (paging, filter, sort).
- [ ] Wallet ledger consistency — balance = sum(ledger entries).

Success criteria: setiap test punya assertion terhadap data yang berubah (state before/after), bukan cuma "page loads".

### Phase P3 — Injection + misconfig + logging (1 hari)

Deliverable: §4 A03, A05, A09 covered.

- [ ] `tests/security/05-injection.spec.mjs` — SQLi payload di search, XSS payload di block content.
- [ ] `tests/security/06-headers.spec.mjs` — security headers assertion.
- [ ] `tests/security/07-audit-log.spec.mjs` — mutation → audit_log entry created.

### Phase P4 — SSRF + upload + rate limit (1 hari)

- [ ] `tests/security/08-ssrf.spec.mjs` — domain verify blocklist.
- [ ] `tests/security/09-upload.spec.mjs` — assets upload malicious filename + magic byte mismatch + size limit.
- [ ] `tests/security/10-rate-limit.spec.mjs` — 6-attempt burst di /auth/login → 429.

### Phase P5 — Quality of life (0.5 hari)

- [ ] Split scripts: `npm run test:smoke` (P0, ~5 menit), `npm run test:regression` (all, ~30 menit).
- [ ] Add Firefox + WebKit ke matrix untuk 3 kritis UI test.
- [ ] Visual regression di 5 halaman kunci (dashboard, editor, admin overview, invoice detail, marketing home).

**Total effort: ~7-8 hari kerja.**

---

## 7. CI/CD integration + quality gates

### 7.1 Pipeline stages

```
PR opened
    │
    ├─► lint + unit (< 2 menit)         ─────► block merge if fail
    │
    ├─► smoke suite (< 5 menit)         ─────► block merge if fail
    │       └─ tests: auth, dashboard load per role, 1 E2E happy path
    │
    ├─► security suite (< 10 menit)     ─────► block merge if fail
    │       └─ tests: A01, A02, A08 mandatory
    │
    └─► regression (< 30 menit, nightly) ────► notify Slack if fail
            └─ tests: all functional + security P3-P4
```

### 7.2 Quality gates

| Gate                                 | Threshold        | Action on fail             |
|--------------------------------------|------------------|----------------------------|
| Smoke test pass rate                 | 100%             | Block deploy               |
| Security A01/A02/A08 pass            | 100%             | Block deploy               |
| Full regression pass rate            | ≥ 98%            | Block merge to main        |
| Flaky test rate (across 10 runs)     | ≤ 2%             | Auto-quarantine dan issue  |
| Test suite duration (smoke)          | ≤ 5 menit p95    | Investigate slow tests     |
| Excel report attached                | Every run        | Missing → CI red           |

### 7.3 Metrics untuk track

- **Coverage %** per role per feature (dari coverage matrix §3).
- **Security scenario pass rate** — mesti 100%, kalau turun berarti backend regress.
- **MTTR** (mean time to fix broken test) — target < 4 jam.
- **False positive rate** — test yang PASS tapi bug lolos ke prod. Track manual, target 0.

---

## 8. Reporting: Excel enhancement per phase

Kolom sekarang: `# | Role | Test Name | Expected | Actual | Status | Duration | Retry`.

Tambahan yang dibutuhin untuk stakeholder non-teknis:

| Kolom baru        | Sumber                                                              | Contoh                             |
|-------------------|---------------------------------------------------------------------|------------------------------------|
| **Category**      | Test file prefix (auth/functional/security)                          | `Security A01`                     |
| **OWASP Ref**     | Explicit annotation `test.info().annotations.push({type:'owasp', description:'A01'})` | `A01: Broken Access Control` |
| **Severity**      | Critical / High / Medium / Low — set per test                        | `Critical`                          |
| **Data verified** | Row count / value diff (before → after untuk mutation test)          | `invoices: 5, sum=Rp 750.000`      |
| **Screenshot**    | Path relatif ke attachment untuk failing test                         | `results/artifacts/...png`         |

Sheet baru:
- **Security Findings** — cuma test category=Security, sorted by severity.
- **Data Assertions** — test yang punya data verification (before/after).
- **Trend** (multi-run) — kalau CI simpan run history JSON, sheet chart pass rate 30 hari terakhir.

---

## 9. Risks & assumptions

**Assumptions**
- Backend `apps/api` sudah menyediakan idempotency-key, HMAC webhook verify, RBAC — test hanya verifikasi behavior, bukan implement.
- QA env terpisah dari production (test dengan mutation TIDAK boleh sentuh prod DB).
- api-registry service (mock atau real) available untuk test purchase/renew flow.
- Payment gateway punya sandbox / mock endpoint yang bisa di-trigger dari test.

**Risks**
- **Test flakiness dari rate limit** — mitigation: token cache + `AUTH_LOGIN_RATE_LIMIT_MAX` naik di QA env atau pakai IP allowlist untuk QA runner.
- **Fixture drift** — schema berubah → fixture rusak. Mitigation: fixture di same repo + migration bump wajib update fixture.
- **False-negative security test** — payload yang seharusnya di-block malah lolos, tapi assertion salah tulis. Mitigation: peer review security test + dedicated review pas naikin severity Critical.
- **Cost of false positive di CI** — kalau test flaky, developer akan bypass. Mitigation: auto-quarantine test yang flaky 2× dalam 10 run.

---

## 10. Ownership + review cadence

- **Test suite ownership**: QA engineer + AppSec engineer (dual review untuk security tests).
- **Backend contract change**: developer wajib update related test + fixture di PR yang sama.
- **Review cadence**:
  - Weekly: pass rate + flaky report review.
  - Sprint boundary: coverage matrix delta (feature baru yang belum di-cover).
  - Quarterly: OWASP mapping revalidation — refresh dengan Top-10 terbaru + threat model produk.

---

## 11. Kickoff sequence (kalau plan ini approved)

1. **Day 1** — P0 done (fix false positives + content assertion). Delivered: report Excel yang jujur.
2. **Day 2-3** — P1 done (A01/A02/A08 security tests). Delivered: 20+ security scenarios pass.
3. **Day 4-5** — P2 done (E2E happy path + pagination + search + sort + wallet ledger). Delivered: coverage matrix functional 80%.
4. **Day 6** — P3 done (injection + headers + audit log). Delivered: security A03/A05/A09 pass.
5. **Day 7** — P4 done (SSRF + upload + rate limit). Delivered: security A10 + A08 supply chain pass.
6. **Day 8** — P5 done (smoke/regression split + CI integration + multi-browser). Delivered: production-ready CI gates.

Setelah plan ini approved, saya update `README.md` + bikin issue tracker (kalau perlu) untuk track per-phase progress.
