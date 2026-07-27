# Setup Caddy tanpa Docker (bare-metal server)

Panduan menjalankan Caddy langsung di server (Ubuntu/Debian) sebagai reverse proxy untuk **API (Go)**, **Dashboard (Next.js)**, dan **Renderer (Next.js)**. Cocok kalau:

- Kamu deploy pakai systemd (bukan Docker Compose)
- Ingin kontrol penuh atas TLS storage + log rotation
- Butuh hemat resource (Docker overhead di kecil-VM lumayan)

Untuk deployment via Docker, lihat [docker-compose.yml](docker-compose.yml) — tidak perlu langkah manual di bawah.

---

## 1. Prasyarat server

| Item | Versi / Catatan |
|---|---|
| OS | Ubuntu 22.04 / 24.04 LTS atau Debian 12 |
| RAM | Minimal 2 GB (rekomendasi 4 GB untuk build Next.js) |
| Ports terbuka | 80, 443 (public) — 8080, 3000, 3001 hanya bind localhost |
| DNS | Domain utama (`app.example.com`, `api.example.com`, `example.com`) A record ke IP server |
| User | Non-root user dengan sudo (jangan jalankan Caddy sebagai root langsung) |

**Layanan pendukung** (asumsi sudah running di server):
- PostgreSQL 16 (systemd atau managed DB)
- Go API di `127.0.0.1:8080` (systemd unit)
- Next.js dashboard di `127.0.0.1:3000`
- Next.js renderer di `127.0.0.1:3001`
- (Opsional) MinIO di `127.0.0.1:9000` kalau pakai `STORAGE_DRIVER=s3`

---

## 2. Install Caddy

### Opsi A — Package resmi (recommended)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo apt update
sudo apt install -y caddy
```

Setelah install, Caddy sudah punya:
- Systemd unit di `/lib/systemd/system/caddy.service`
- User + group `caddy`
- Config default `/etc/caddy/Caddyfile`
- TLS storage `/var/lib/caddy/.local/share/caddy/`
- Log ke journald

### Opsi B — Binary dari GitHub (kalau butuh plugin custom)

```bash
# Download versi stabil terbaru — cek https://github.com/caddyserver/caddy/releases
curl -L -o /tmp/caddy.tar.gz https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_linux_amd64.tar.gz
sudo tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin caddy
sudo chmod +x /usr/local/bin/caddy
```

Buat user + group + systemd unit manual (contoh di section 5).

---

## 3. Buat direktori + user

Kalau install via package (Opsi A), lewatkan bagian ini — caddy user sudah ada.

```bash
sudo groupadd --system caddy
sudo useradd --system \
  --gid caddy \
  --create-home \
  --home-dir /var/lib/caddy \
  --shell /usr/sbin/nologin \
  --comment "Caddy web server" \
  caddy

sudo mkdir -p /etc/caddy /var/log/caddy
sudo chown -R caddy:caddy /var/lib/caddy /var/log/caddy
```

---

## 4. Caddyfile untuk production

Copy dari repo lalu **edit dua hal**:
1. Ganti `app:3000`, `api:8080`, `renderer:3000` → `127.0.0.1:PORT` (nama service Docker tidak resolve di host)
2. Ganti `app.localhost`/`api.localhost`/`localhost` → domain real production

```bash
sudo cp /path/to/repo/infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo chown caddy:caddy /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Contoh isi `/etc/caddy/Caddyfile` untuk production:

```caddyfile
{
	# Email untuk ACME (Let's Encrypt) — dipakai kirim expiry notice
	email admin@example.com

	# On-demand TLS: sebelum issue cert untuk domain baru, tanya API dulu.
	# API validate: domain terdaftar di user? verified? Kalau OK → 200.
	# Secret di query supaya API tahu request datang dari Caddy, bukan random.
	on_demand_tls {
		ask http://127.0.0.1:8080/internal/caddy/ask?secret={$CADDY_ASK_SECRET}
		interval 2m
		burst 5
	}
}

# ---------- Dashboard editor ----------
app.example.com {
	encode gzip zstd
	reverse_proxy 127.0.0.1:3000
	log {
		output file /var/log/caddy/app.log
	}
}

# ---------- Public API ----------
api.example.com {
	encode gzip zstd
	# CORS di-handle backend Fiber; Caddy cuma proxy.
	reverse_proxy 127.0.0.1:8080
	log {
		output file /var/log/caddy/api.log
	}
}

# ---------- Renderer default (host utama platform) ----------
example.com, www.example.com {
	encode gzip zstd
	reverse_proxy 127.0.0.1:3001
	log {
		output file /var/log/caddy/renderer.log
	}
}

# ---------- Custom domain user (on-demand TLS) ----------
# Catch-all untuk domain custom yang di-attach user via wizard.
# Caddy panggil `/internal/caddy/ask` sebelum issue cert.
:443 {
	tls {
		on_demand
	}
	encode gzip zstd
	reverse_proxy 127.0.0.1:3001
	log {
		output file /var/log/caddy/custom-tls.log
	}
}

# HTTP fallback — kalau custom domain akses via http, tetap serve renderer.
# ACME challenge (port 80) juga lewat sini.
:80 {
	encode gzip zstd
	reverse_proxy 127.0.0.1:3001
}
```

### Environment variables untuk Caddy

Caddy butuh `CADDY_ASK_SECRET` — sama value dengan `CADDY_ASK_SECRET` di API. Set di systemd override:

```bash
sudo systemctl edit caddy
```

Isi:

```ini
[Service]
Environment=CADDY_ASK_SECRET=CHANGE-ME-TO-RANDOM-SECRET
```

Random secret: `openssl rand -hex 32`.

**Reload** setelah edit:

```bash
sudo systemctl daemon-reload
sudo systemctl restart caddy
```

---

## 5. Systemd unit (kalau install dari binary — Opsi B)

Skip kalau pakai package apt.

```bash
sudo tee /lib/systemd/system/caddy.service > /dev/null <<'EOF'
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now caddy
```

`CAP_NET_BIND_SERVICE` = izin bind port <1024 (80/443) tanpa root.

---

## 6. Validasi + start

```bash
# Validate config (highlight typo sebelum reload)
sudo caddy validate --config /etc/caddy/Caddyfile

# Start / reload
sudo systemctl reload caddy   # graceful — no dropped connections
sudo systemctl status caddy

# Cek log realtime
sudo journalctl -fu caddy
# atau
sudo tail -f /var/log/caddy/*.log
```

### Test manual

```bash
curl -I https://app.example.com
# Harus balik 200 + `alt-svc: h3=":443"` (HTTP/3)

curl -I https://api.example.com/healthz
# {"status":"ok","checks":{...}}

# Test on-demand TLS (butuh domain sudah verified di dashboard)
curl -I https://userdomain.com
# Cert first-time butuh ~5 detik (ACME challenge) — subsequent request instant
```

---

## 7. Flow: user beli domain → SSL aktif

Ini penjelasan **end-to-end** dari user klik "Beli Domain" sampai domainnya bisa diakses via HTTPS. Alur di-split jadi 4 fase supaya gampang debug per titik.

### Timeline ringkas

```
                     ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌──────────┐
   User klik beli ─→ │ FASE 1   │ ─→│ FASE 2   │ ─→│ FASE 3     │ ─→│ FASE 4   │
                     │ Purchase │   │ Provision│   │ DNS + CF   │   │ SSL live │
                     │ (~5 mnt) │   │ (~5 mnt) │   │ (~5-60 mnt)│   │ (~5 dtk) │
                     └──────────┘   └──────────┘   └────────────┘   └──────────┘
                          │              │               │               │
                     registrar-api    EPP register     Cloudflare       Caddy
                     + Midtrans       di registry      zone + NS        + Let's Encrypt
```

### FASE 1 — Purchase (~5 menit, user-driven)

**Yang terjadi:**

1. User buka `/sites/new-with-domain` → cari domain → pilih hasil
2. Frontend POST `/api/v1/domains/purchase` dengan header `Idempotency-Key`
3. Web-builder API proxy ke registrar-api `/v1/api/user/reseller/domain/register`
4. Registrar bikin `reseller_domain_jobs` row + invoice + payment_url (Midtrans/Paylabs)
5. Response `{ job_id, payment_url, status: "pending_payment" }`
6. User redirect ke `/sites/pending/<job_id>` — polling status tiap 2 detik
7. User klik "Buka halaman pembayaran" → bayar di Midtrans/Paylabs
8. Payment gateway callback ke registrar → status `pending_payment` → `pending_provisioning`

**Debug fase 1:**

```bash
# Status job dari registrar
curl -H "Authorization: Bearer $USER_JWT" \
  https://api.example.com/api/v1/domains/purchases/<job_id>

# Log web-builder API
sudo journalctl -u webbuilder-api -f | grep "domain_purchase"
```

**Failure mode:**
- 400 `idempotency_key_required` → frontend miss header, retry akan bikin double-charge kalau tidak fix
- 409 dari registrar → job existing untuk domain sama masih pending, backend seharusnya resume via `FindResumableJob`

---

### FASE 2 — Provisioning EPP (~5 menit, otomatis)

**Yang terjadi:**

1. Registrar-api background worker terima payment webhook → status `pending_provisioning`
2. Worker jalankan EPP CREATE ke registry .id (PANDI) atau TLD lain
3. Registry balik OK → status `active` + `expires_at` di-set
4. Registrar-api fire webhook ke web-builder: `POST /webhooks/registrar/domain-status`
5. Web-builder verify HMAC signature + timestamp (max 60 detik) → update `domain_purchases` row lokal ke `active`

**Debug fase 2:**

```bash
# Log webhook receiver
sudo journalctl -u webbuilder-api -f | grep "webhook"

# Metric via Prometheus
curl http://127.0.0.1:8080/metrics | grep domain_purchase_webhooks_total
```

**Failure mode:**
- Webhook `invalid_signature` → `REGISTRAR_WEBHOOK_SECRET` beda antara registrar dan web-builder
- Webhook `stale_timestamp` → clock skew server > 60s (fix: `sudo timedatectl set-ntp true`)
- Registry EPP reject → status jadi `failed`, user lihat "Coba lagi" di pending page

**Self-heal:** kalau webhook drop total, periodic sync goroutine di web-builder pull ground truth dari registrar tiap 6 jam. User juga bisa trigger manual via tombol "Sinkronkan" di `/settings/domains`.

---

### FASE 3 — DNS + Cloudflare (~5-60 menit, otomatis + tunggu DNS propagate)

**Yang terjadi (auto-attach flow):**

1. Webhook `active` → web-builder call `tryAttachToCloudflare()`
2. `POST https://api.cloudflare.com/client/v4/zones` → CF assign nameservers baru (`ns1.cloudflare.com` + `ns2`)
3. Kalau `PLATFORM_IPS` di-set: bikin DNS records di CF zone:
   - `A @ → <server IP>` (proxied via edge)
   - `CNAME www → <domain>` (proxied)
4. Web-builder push NS baru ke registrar via `UpdateNameservers`
5. Registrar EPP UPDATE → NS di registry berubah ke CF's
6. **DNS propagation** — 5-60 menit (kadang jam) sampai resolver dunia refresh NS

**Debug fase 3:**

```bash
# Cek NS aktif di registry
dig NS userdomain.com +short
# Harus balik: ns1.cloudflare.com. + ns2.cloudflare.com.

# Cek A record via CF authoritative
dig @ns1.cloudflare.com userdomain.com +short
# Harus balik: <PLATFORM_IPS>

# Cek propagation dari resolver publik
dig @1.1.1.1 userdomain.com +short
dig @8.8.8.8 userdomain.com +short

# Log auto-attach
sudo journalctl -u webbuilder-api -f | grep "cloudflare attach"

# Metric
curl http://127.0.0.1:8080/metrics | grep cloudflare_attach_total
```

**Failure mode:**
- CF token tidak punya scope Zone:Edit → zone creation gagal, log warn tapi domain tetap active di registry. Admin fix manual di CF dashboard.
- `PLATFORM_IPS` kosong → zone dibuat tapi tidak ada A record → domain resolve nowhere. Fix: set env + auto-retry via sync goroutine.
- NS push ke registrar timeout → registrar tetap pakai NS lama (default hosting reseller). User bisa manual override di `/settings/domains/[name]/nameservers`.

---

### FASE 4 — First HTTPS access → Caddy issue SSL (~5 detik, otomatis)

**Prasyarat:**
- Site sudah `status = 'published'` (user klik "Terbitkan" di editor)
- Domain sudah attached ke site (`domain_purchases.site_id != NULL`)
- DNS sudah propagate (fase 3 selesai)

**Yang terjadi (Caddy on-demand TLS):**

1. Visitor akses `https://userdomain.com` dari browser
2. Request masuk ke Caddy port 443 → catch-all `:443` block match
3. Caddy TLS handshake ClientHello → SNI = `userdomain.com`
4. Caddy cek cert cache di `/var/lib/caddy/.local/share/caddy/certificates/` — miss (first time)
5. **On-demand check:** Caddy `GET http://127.0.0.1:8080/internal/caddy/ask?domain=userdomain.com&secret=CADDY_ASK_SECRET`
6. Web-builder validate:
   - Secret match `CADDY_ASK_SECRET` di API env ✓
   - Domain terdaftar di `sites` (via `GetByHost` dual lookup `domains` + `domain_purchases`)
   - Site status = `published`
   - Kalau ✓ semua → return **200 OK**. Kalau tidak → **404** (Caddy tolak issue cert)
7. Caddy OK → jalankan ACME challenge ke Let's Encrypt:
   - Method: HTTP-01 (via `/.well-known/acme-challenge/...` di port 80)
   - Atau TLS-ALPN-01 (via port 443)
8. Let's Encrypt validate → issue cert (~3 detik)
9. Caddy cache cert di storage + serve TLS response
10. Response ke browser: `200 OK` dengan HTTPS aktif

**Subsequent request:** Cert sudah cached → skip step 5-9. Direct serve dari cache (0 latency added).

**Auto-renewal:** Caddy check cert expiry setiap hari. 30 hari sebelum expire → re-issue ke Let's Encrypt otomatis. Zero downtime.

**Debug fase 4:**

```bash
# Simulasi ask endpoint — kalau 200 = Caddy boleh issue cert
curl -v "http://127.0.0.1:8080/internal/caddy/ask?domain=userdomain.com&secret=$CADDY_ASK_SECRET"

# Watch Caddy log saat first-time access
sudo journalctl -fu caddy | grep -E "certificate|acme|tls"

# List cert yang sudah di-issue
sudo ls /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/

# Cek cert detail
echo | openssl s_client -connect userdomain.com:443 -servername userdomain.com 2>/dev/null \
  | openssl x509 -noout -subject -dates -issuer
```

**Failure mode:**

| Symptom | Root cause | Fix |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | DNS belum propagate | Tunggu / verify dengan `dig` |
| Caddy log `ask endpoint returned 4xx` | Secret mismatch atau site belum published | Cek `curl` ask di atas + editor "Terbitkan" |
| `too many failed authorizations` (LE rate limit) | Berkali-kali retry gagal (5 per hostname/hour) | Tunggu 1 jam + pastikan DNS OK sebelum retry |
| Cert issued tapi `SSL_ERROR_BAD_CERT_DOMAIN` | SNI mismatch atau proxy Cloudflare "flexible" mode | Cek CF SSL mode = "Full" atau "Full (strict)", bukan "Flexible" |
| Browser `ERR_CERT_AUTHORITY_INVALID` | Cert self-signed (Caddy fallback saat LE fail) | Cek log LE error + Caddy `caddy trust` local dev only |

---

### Ringkasan waktu total

| Skenario | Total waktu |
|---|---|
| Ideal (payment cepat + DNS cache warm) | **~10-15 menit** |
| Normal (DNS propagate wait) | **~30-60 menit** |
| Worst case (registry lambat + DNS TTL lama) | **~2-4 jam** |

User bisa monitor progress di `/sites/pending/<job_id>` (polling 2-5 detik) dan `/settings/domains/<name>` (nameserver + DNS + WHOIS status).

---

## 8. Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (ACME challenge + redirect ke HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 443/udp   # HTTP/3 (opsional, tapi improve perf)
sudo ufw enable
```

**Jangan buka** port 8080/3000/3001 ke public — hanya Caddy yang boleh reach (lewat 127.0.0.1).

Pastikan API + dashboard + renderer bind hanya ke localhost:
- API: `HTTP_ADDR=127.0.0.1:8080` (bukan `:8080`)
- Next.js: `next start -H 127.0.0.1 -p 3000`

---

## 9. TLS storage + backup

Caddy simpan cert di:
- Package install: `/var/lib/caddy/.local/share/caddy/certificates/`
- Binary install: `~caddy/.local/share/caddy/certificates/`

**Backup rutin** (cegah rate-limit Let's Encrypt kalau server hilang):

```bash
# Cron weekly
0 3 * * 0 tar -czf /backup/caddy-certs-$(date +\%F).tar.gz /var/lib/caddy/.local/share/caddy
```

Restore ke server baru dengan `tar -xzf` ke path yang sama + `chown -R caddy:caddy`.

---

## 10. Log rotation

Package install: `caddy.service` sudah pipe ke journald otomatis. Kalau pakai `log { output file ... }`, tambah `logrotate`:

```bash
sudo tee /etc/logrotate.d/caddy > /dev/null <<'EOF'
/var/log/caddy/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 caddy caddy
    sharedscripts
    postrotate
        systemctl reload caddy > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## 11. Update Caddy

```bash
# Opsi A (apt)
sudo apt update && sudo apt upgrade caddy
sudo systemctl restart caddy

# Opsi B (binary) — download versi baru, replace, restart
sudo systemctl stop caddy
sudo curl -L -o /usr/local/bin/caddy https://.../caddy_new
sudo chmod +x /usr/local/bin/caddy
sudo systemctl start caddy
```

---

## 12. Troubleshooting

| Gejala | Kemungkinan penyebab | Fix |
|---|---|---|
| `caddy: TLS challenge failed` | Port 80 tidak reachable dari internet | Cek firewall + DNS A record propagated |
| Custom domain 403 waktu first-access | `/internal/caddy/ask` return 4xx (domain belum verified) | User perlu ke `/settings/domains/[name]` → Verify |
| `panic: bind: permission denied` | Caddy tidak punya CAP_NET_BIND_SERVICE | Cek `AmbientCapabilities` di systemd unit |
| Cert renewal gagal terus | Storage dir permission salah | `sudo chown -R caddy:caddy /var/lib/caddy` |
| `on_demand_tls: ask URL required` | Env `CADDY_ASK_SECRET` tidak ke-load | Cek `systemctl show caddy -p Environment` |
| Reload tidak apply perubahan | Cache config lama | `caddy stop && caddy start` (bukan reload) |

### Debug ask endpoint

```bash
# Simulasi request Caddy ke API — kalau balik 200, on-demand OK
curl -v "http://127.0.0.1:8080/internal/caddy/ask?domain=userdomain.com&secret=$CADDY_ASK_SECRET"
```

Kalau balik 403 padahal domain sudah verified: cek `CADDY_ASK_SECRET` di Caddy vs API — harus identik.

---

## 13. Kaitan dengan aplikasi

Environment variables yang **wajib match** antara Caddy dan API (kalau beda → on-demand TLS fail):

| Env | Caddy | API |
|---|---|---|
| `CADDY_ASK_SECRET` | Di `/etc/systemd/system/caddy.service.d/override.conf` | Di `apps/api/.env` |

Environment yang perlu di-set di **API** untuk production:

```bash
APP_ENV=production
APP_BASE_URL=https://app.example.com
PUBLIC_APP_HOST=app.example.com
PUBLIC_API_HOST=api.example.com
RENDERER_DEFAULT_HOST=example.com
CORS_ORIGINS=https://app.example.com
PLATFORM_IPS=203.0.113.10  # public IP server (untuk auto-attach Cloudflare A record)
CADDY_ASK_SECRET=<same-as-caddy>
```

Full env list: [apps/api/.env.example](../apps/api/.env.example).
