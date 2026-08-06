# Bruno Collection — api-registry

[Bruno](https://www.usebruno.com/) API testing collection untuk `api-registry` service. Alternative Postman yang stores collection sebagai file `.bru` (git-friendly, no cloud sync).

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
2. **File → Open Collection** → arahkan ke folder ini (`apps/api-registry/bruno/`).
3. Collection "api-registry" muncul di sidebar dengan 4 folder: Health, Domains, Contacts, Whois, Jobs.

## Setup Environment

Ada 2 format env di folder ini — pilih sesuai versi Bruno kamu:

### Bruno v1.x (native `.bru` support)

Env otomatis ke-load saat Open Collection. Pilih di dropdown pojok kanan atas: **Local** atau **Production**. Klik ikon pensil untuk edit `hmac_secret`.

### Bruno v3.x atau versi yang hanya support JSON

Env `.bru` **tidak auto-load**. Kamu harus **import manual** file JSON-nya:

1. Klik icon environment di sidebar collection → **Import Environment**
2. Pilih file [`environments/Local.json`](environments/Local.json) → import
3. Ulangi untuk [`environments/Production.json`](environments/Production.json)
4. Di dropdown env sekarang muncul **Local** + **Production**
5. Klik pensil di sebelah env → set `hmac_secret` sesuai `INTERNAL_HMAC_SECRET` di `.env` api-registry:
   ```bash
   INTERNAL_HMAC_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Save.

**Local env** default target `http://localhost:4012` (api-registry local via `air` atau `go run`).

**Production env** — ganti `base_url` sesuai deploy (mis. `https://api-registry.internal.yourdomain.com`).

## HMAC Auto-Signing

Setiap request ke `/v1/*` di-sign otomatis oleh pre-request script di `collection.bru`. Script:

1. Ambil `hmac_secret` dari env.
2. Compute canonical string: `{unix_ts}.{METHOD}{PATH+QUERY}.{BODY}` (persis format di [security/hmac.go](../internal/security/hmac.go)).
3. Set header `X-Timestamp` + `X-Signature` (`sha256=<hex>`).

Kalau `hmac_secret` kosong, script skip signing (dev mode kalau server juga jalan tanpa secret). Prod bakal balik 401.

Endpoint infra (`/healthz`, `/readyz`, `/version`, `/metrics`, `/openapi.json`) di-skip HMAC.

### Kalau header tidak ter-generate otomatis

Bruno v1.20+ default pakai **safe sandbox** yang blokir `require('crypto')`. Kalau kamu buka tab **Headers** dan tidak lihat `X-Timestamp` / `X-Signature` (padahal sudah set `hmac_secret`), berarti script fail silently. Fix:

**1. Aktifkan Developer sandbox** (paling sering ini penyebabnya):
- Bruno app → **Preferences** (⌘,) → tab **Scripts**
- Ubah **"Sandbox Mode"** dari `safe` ke `developer`
- Restart Bruno

**2. Cek `bruno.json` sudah whitelist `crypto`**:
Collection ini sudah punya:
```json
"scripts": {
  "moduleWhitelist": ["crypto", "buffer", "url"]
}
```
Kalau kamu edit collection dari Bruno UI, pastikan tidak overwrite field ini.

**3. Cek Bruno console** (`View → Toggle Developer Tools`) untuk log:
- `[HMAC] signed POST /v1/domains/check ts=1234567890` → OK, header ter-set
- `[HMAC] hmac_secret env kosong` → set env dulu
- `[HMAC] pre-request script error: ...` → script exception, biasanya `require` di-block

**4. Fallback — manual header** (kalau sandbox tetap tidak bisa di-enable):
Generate HMAC manual di shell (lihat section "Alternative: curl" di bawah), lalu paste `X-Timestamp` + `X-Signature` di tab Headers per request. Tidak scalable, tapi work.

## Struktur Collection

```
bruno/
├── bruno.json                 # config
├── collection.bru             # pre-request script HMAC
├── environments/
│   ├── Local.bru
│   └── Production.bru
├── Health/
│   ├── Healthz.bru
│   ├── Readyz.bru
│   ├── Version.bru
│   └── Metrics.bru
├── Domains/
│   ├── Check.bru              # POST /v1/domains/check
│   ├── BulkCheck.bru          # POST /v1/domains/bulk-check
│   ├── Info.bru               # GET /v1/domains/:name/info
│   ├── Register.bru           # POST /v1/domains/register
│   ├── Renew.bru              # POST /v1/domains/:name/renew
│   ├── RegisterStatus.bru     # GET /v1/domains/register/:job_id/status
│   ├── GetNameservers.bru
│   ├── UpdateNameservers.bru
│   └── UpdateContact.bru      # PATCH /v1/domains/:name/contact
├── Contacts/
│   ├── GetContact.bru
│   └── UpdateContact.bru
├── Whois/
│   └── Whois.bru
└── Jobs/
    ├── ListJobs.bru
    └── GetJob.bru
```

## Testing Workflow

1. **Health check** — pastikan service up:
   ```
   Health/Healthz     → 200 {"status":"ok"}
   Health/Readyz      → 200 kalau EPP session hidup, 503 kalau EPP down
   ```
2. **Cek domain** — verify HMAC signing works:
   ```
   Domains/Check      → 200 {results:[{available:true/false}]}
   ```
   Kalau 401 `signature/timestamp header wajib` → cek `hmac_secret` di env.

3. **Register flow** — full E2E dengan idempotency:
   ```
   Domains/Register   → 200 {job_id, status:"active"}
   Domains/Info       → 200 (verify domain baru di registry)
   ```

## Debug HMAC Mismatch

Kalau dapet `401 signature mismatch`:

1. Cek `hmac_secret` di env Bruno vs `INTERNAL_HMAC_SECRET` di api-registry — harus persis sama.
2. Cek timestamp skew — HP jam-nya beda dari server > 5 menit → auto-reject. Sync NTP dulu.
3. Cek body encoding — Bruno JSON body harus valid parseable. Kalau ada trailing whitespace / BOM, hash bisa beda.
4. Tail server log (`tmp/epp.log` atau stdout `air`) → cari log `signature mismatch` untuk lihat expected canonical string.

## Alternative: curl

Kalau tidak mau install Bruno, generate signature manual di shell:

```bash
SECRET="your-secret"
TS=$(date +%s)
BODY='{"domain":"example.id"}'
METHOD=POST
PATH_QS="/v1/domains/check"
CANONICAL="${TS}.${METHOD}${PATH_QS}.${BODY}"
SIG="sha256=$(echo -n "$CANONICAL" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')"

curl -X POST http://localhost:5000${PATH_QS} \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Signature: ${SIG}" \
  -d "${BODY}"
```

## References

- Bruno docs: https://docs.usebruno.com/
- Bruno scripting: https://docs.usebruno.com/scripting/getting-started.html
- HMAC middleware source: [apps/api-registry/internal/security/hmac.go](../internal/security/hmac.go)
