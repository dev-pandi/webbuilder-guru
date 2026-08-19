# Screenshot Auto-Capture Script

Playwright script yang auto-capture screenshot semua page per role. Output
langsung masuk ke `../screenshots/` — otomatis dipakai HTML/PDF generator.

## Prerequisites

- **Node.js 18+** (untuk ESM + native fetch)
- **4 akun test** di DB dengan role sesuai (buat via `/admin/users` dulu):
  - `client-test@example.com` (role: client)
  - `agent-test@example.com` (role: agent)
  - `reseller-test@example.com` (role: reseller, status: active/approved)
  - `admin@example.com` (role: admin)
- **Sample data** — minimal 1 situs published di akun client, 1 klien di akun reseller

## Setup

```bash
cd docs/user-guide/capture-screenshots

# 1. Install Playwright + Chromium browser
npm install
npm run install-browsers

# 2. Copy environment template + isi
cp .env.example .env
$EDITOR .env   # isi kredensial + URL

# 3. Optional: source env kalau tidak pakai dotenv
export $(cat .env | xargs)
```

## Cara Pakai

### Capture semua role

```bash
npm run capture
# atau
node capture.mjs
```

Hasil di `../screenshots/` — puluhan PNG:
```
screenshots/
├── client-dashboard.png
├── client-editor-overview.png
├── client-theme-page.png
├── ...
├── agent-dashboard.png
├── reseller-dashboard.png
├── admin-stats.png
└── ...
```

### Capture 1 role saja

```bash
npm run capture:admin
npm run capture:client
npm run capture:reseller
npm run capture:agent

# atau lewat argument
node capture.mjs admin
node capture.mjs client reseller  # multi role
```

### Debug (browser visible)

```bash
HEADED=1 node capture.mjs client
# Browser window akan muncul, bisa lihat apa yang script lakukan.
```

### Verbose logs

```bash
VERBOSE=1 node capture.mjs
```

## Setelah Capture

Regenerate PDF supaya screenshot masuk:

```bash
cd ..
./generate-pdf-chrome.sh
open web-builder-guide.pdf
```

Screenshot yang sudah di `screenshots/` otomatis embed di PDF (referensi
`![alt](screenshots/xxx.png)` di markdown).

## Struktur Kode

```
capture-screenshots/
├── package.json        — Deps + npm scripts
├── config.mjs          — URL + credentials + list of captures
├── auth.mjs            — Login helper (token via API, fallback UI form)
├── capture.mjs         — Main script (navigate + screenshot loop)
├── .env.example        — Template environment
├── .env                — Real env (git-ignored)
└── README.md           — File ini
```

### Modifikasi

**Tambah screenshot baru:**

Edit `config.mjs` — cari section `captures.{role}` (mis. `captures.admin`),
tambah entry baru:

```javascript
{
  name: "admin-my-new-page",       // nama file output
  path: "/admin/my-new-page",       // URL path
  waitFor: 'main, h1',              // selector wait
  // Optional: action untuk interact dulu
  action: async (page) => {
    await page.locator('button:has-text("Something")').click();
  },
},
```

Jalanin ulang `npm run capture:admin` — screenshot baru masuk.

**Update credential akun:**

Edit `.env` — set `{ROLE}_EMAIL` + `{ROLE}_PASSWORD`.

**Pakai sample data spesifik (bukan auto-discover):**

Kalau auto-discover pilih site/domain yang tidak representatif, hardcode di
`.env`:

```
SAMPLE_SITE_ID=7b836403-954e-42e1-b00b-2fb59cdcae25
SAMPLE_DOMAIN=jualanpinggirjalan.web.id
SAMPLE_CLIENT_ID=abc123-xxx-...
```

## Troubleshoot

### `Login failed 401`

- Cek email + password di `.env` benar
- Cek akun exist di DB dengan role yang benar
- Cek API base URL benar (auto-derived kalau kosong)

**Manual test API:**
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}'
```

Harus return 200 + JSON dengan `access_token`.

### Screenshot blank/loading

Selector `waitFor` mungkin tidak match. Debug pakai `HEADED=1`:
```bash
HEADED=1 VERBOSE=1 node capture.mjs admin
```

Lihat browser window — kalau page load tapi content belum, tambah:
```javascript
preScreenshotDelay: 3000  // wait 3 detik extra
```

### Auto-discover siteId/domain fail

Manual set di `.env`:
```
SAMPLE_SITE_ID=<UUID>
SAMPLE_DOMAIN=<domain>
```

Cari nilai dari admin panel atau psql:
```sql
SELECT id, name, custom_domain FROM sites WHERE status='published' LIMIT 5;
```

### Playwright browser install error

```bash
npx playwright install-deps chromium   # Linux OS deps
npx playwright install chromium
```

### Screenshot terlalu besar / kabur

Adjust viewport di `config.mjs`:
```javascript
viewport: { width: 1920, height: 1080 }  // full HD
// atau
viewport: { width: 1280, height: 720 }   // smaller
```

Kalau butuh full page (bukan viewport only):
```javascript
screenshot: { fullPage: true }
```

## CI/CD Integration

Kalau mau otomasi (mis. regenerate PDF setelah deploy):

```yaml
# .github/workflows/docs.yml
name: Update Docs Screenshots
on:
  workflow_dispatch:  # manual trigger
  # atau: schedule: - cron: '0 0 * * 0'  # tiap Minggu

jobs:
  capture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install Playwright
        run: |
          cd docs/user-guide/capture-screenshots
          npm ci
          npm run install-browsers
      - name: Capture screenshots
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
          ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
          # ... other creds
        run: |
          cd docs/user-guide/capture-screenshots
          npm run capture
      - name: Regenerate PDF
        run: |
          cd docs/user-guide
          ./generate-pdf-chrome.sh
      - name: Commit + push
        run: |
          git config user.name "docs-bot"
          git config user.email "bot@example.com"
          git add docs/user-guide/screenshots/ docs/user-guide/web-builder-guide.pdf
          git commit -m "docs: refresh screenshots + regen PDF" || echo "no changes"
          git push
```

## Time Estimate

Full capture (semua 4 role, ~30 pages) di local dev: **2-3 menit**.
CI environment (Ubuntu + Chromium install fresh): **5-8 menit**.
