# Setup Caddy sebagai Reverse Proxy di Ubuntu Server

Panduan step-by-step deploy Caddy 2 sebagai reverse proxy untuk stack web-builder di Ubuntu 22.04 / 24.04. Cover instalasi resmi, on-demand TLS untuk custom domain user, integrasi dengan 4 service (api, api-registry, web, renderer), plus troubleshoot common issues.

**Arsitektur akhir:**

```
Internet
    ↓ :80 / :443
  Caddy (Ubuntu server, public IP)
    ├── app.yourdomain.com    → 127.0.0.1:4000  (Next.js dashboard)
    ├── api.yourdomain.com    → 127.0.0.1:8080  (Go API)
    ├── (custom domain user)  → 127.0.0.1:4001  (Next.js renderer)
    └── on-demand TLS ask     → 127.0.0.1:8080/internal/caddy/ask
```

**api-registry (port 5000) TIDAK di-expose ke Caddy** — internal only, cuma di-akses dari `api` via loopback / private network.

---

## 1. Prerequisites

- Ubuntu 22.04 LTS atau 24.04 LTS, root/sudo access
- Public IP (kalau server di cloud, IP dari DigitalOcean / AWS / GCP)
- Domain `yourdomain.com` dengan DNS control (untuk apex + wildcard atau sub-domain per service)
- Firewall port 80 + 443 open (untuk HTTPS + ACME challenge)
- Stack sudah running via PM2 di server yang sama (lihat [ecosystem.config.js](ecosystem.config.js)):
  - `api` di `:8080`
  - `api-registry` di `:5000` (internal)
  - `web` di `:4000`
  - `renderer` di `:4001`

---

## 2. Install Caddy (via official APT repo)

```bash
# Update apt index
sudo apt update

# Install prerequisites
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

# Add Caddy's GPG key + repo (dari cloudsmith, resmi)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# Install caddy
sudo apt update
sudo apt install -y caddy

# Verify
caddy version   # → v2.x.x
systemctl status caddy   # → active (running)
```

Package `caddy` otomatis:
- Bikin user + group `caddy`
- Create dir `/etc/caddy/`, `/var/lib/caddy/` (cert storage), `/var/log/caddy/`
- Install systemd unit `caddy.service` + enable auto-start on boot

---

## 3. Firewall (UFW)

```bash
# Kalau UFW belum aktif, enable dulu tapi ALLOW SSH!
sudo ufw allow OpenSSH        # 22/tcp — jangan lock diri sendiri
sudo ufw allow 80/tcp         # HTTP (ACME challenge + redirect)
sudo ufw allow 443/tcp        # HTTPS
sudo ufw allow 443/udp        # HTTP/3 (QUIC) — Caddy support by default
sudo ufw --force enable
sudo ufw status               # verify: 80, 443/tcp, 443/udp allowed
```

Kalau di cloud (AWS/GCP/DO), atur juga **security group / firewall rules** di panel — UFW cuma protect di OS level.

---

## 4. DNS Setup

Point domain ke server IP. Contoh minimum:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| `A` | `app.yourdomain.com` | `1.2.3.4` (server IP) | 300 |
| `A` | `api.yourdomain.com` | `1.2.3.4` | 300 |
| `A` | `yourdomain.com` | `1.2.3.4` | 300 (root untuk renderer) |
| `A` | `*.yourdomain.com` | `1.2.3.4` (opsional — untuk sub-domain user) | 300 |

**Untuk custom domain user** (`myshop.id`, `budi-photography.com`, dst.) — user set `A` record di DNS provider mereka pointing ke `1.2.3.4`. Caddy akan on-demand ACME cert saat first request.

---

## 5. Caddyfile

Referensi: [infra/caddy/Caddyfile](infra/caddy/Caddyfile) yang dev pattern. Untuk **production**, ganti hostname localhost jadi hostname real.

Edit `/etc/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

Isi:

```caddyfile
# Global options
{
    # Email untuk ACME registration + notifikasi cert expiry.
    email admin@yourdomain.com

    # On-demand TLS: Caddy tanya ke API sebelum issue cert untuk domain baru.
    # Cegah cert issuance dari attacker yang point DNS random ke server kita.
    on_demand_tls {
        ask http://127.0.0.1:8080/internal/caddy/ask?secret={$CADDY_ASK_SECRET}
        interval 2m
        burst 5
    }

    # HTTP/3 default on. Kalau ada issue firewall UDP, comment ini.
    # servers {
    #     protocols h1 h2
    # }
}

# ---------- Platform dashboards ----------

# Dashboard admin / reseller / agent / client
app.yourdomain.com {
    reverse_proxy 127.0.0.1:4000

    # Optional: security headers standard.
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        # HSTS 1 tahun + preload — pastikan yakin HTTPS-only sebelum enable.
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }

    log {
        output file /var/log/caddy/app-access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}

# Public API — CORS di-handle di API side (Fiber middleware).
api.yourdomain.com {
    reverse_proxy 127.0.0.1:8080 {
        # Preserve original scheme + host untuk Idempotency-Key trust.
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Larger body untuk upload dokumen / bukti transfer / template pages_json.
    request_body {
        max_size 20MB
    }

    log {
        output file /var/log/caddy/api-access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}

# ---------- Renderer (public multi-tenant SSR) ----------

# Root domain — kalau kamu pakai `yourdomain.com` sebagai landing renderer.
# Skip block ini kalau root domain di-pakai untuk marketing site terpisah.
yourdomain.com {
    reverse_proxy 127.0.0.1:4001
    log {
        output file /var/log/caddy/renderer-root.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}

# Catch-all untuk custom domain user (myshop.id, dst.) + subdomain
# platform (kalau ada). Caddy call `ask` endpoint sebelum ACME.
:443 {
    tls {
        on_demand
    }
    reverse_proxy 127.0.0.1:4001 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up Host {host}
    }
    log {
        output file /var/log/caddy/renderer-tenant.log {
            roll_size 200mb
            roll_keep 10
        }
    }
}

# HTTP → 401 → auto-redirect ke HTTPS untuk domain yang punya cert.
# Caddy handle otomatis; tapi untuk custom domain yang belum on-boarded,
# kita passthrough ke renderer supaya user tetap dapet response
# (misalnya "domain belum terhubung ke situs Anda").
:80 {
    reverse_proxy 127.0.0.1:4001
}
```

**Ganti**:
- `admin@yourdomain.com` → email ops kamu (untuk notifikasi expiry cert)
- `app.yourdomain.com`, `api.yourdomain.com`, `yourdomain.com` → domain sebenarnya
- `{$CADDY_ASK_SECRET}` — env variable, di-set di step berikutnya

---

## 6. Set `CADDY_ASK_SECRET` Environment

Secret untuk auth Caddy ↔ API (cegah orang random hit `/internal/caddy/ask` untuk trigger cert issuance).

```bash
# Generate secret random
CADDY_ASK_SECRET=$(openssl rand -hex 32)
echo "Secret: $CADDY_ASK_SECRET"   # copy — masukin ke .env api juga
```

Edit systemd override supaya Caddy load env variable:

```bash
sudo systemctl edit caddy
```

Isi (di section `[Service]`):

```ini
[Service]
Environment="CADDY_ASK_SECRET=paste-secret-di-sini"
```

Save. Set juga di `.env` API supaya `/internal/caddy/ask` handler compare:

```bash
sudo -u <user-pm2> nano ~/web-builder/apps/api/.env
# Tambahin:
# CADDY_ASK_SECRET=paste-secret-yang-sama
```

Restart both:

```bash
sudo systemctl restart caddy
pm2 restart api
```

---

## 7. Reload Caddy + Verify

```bash
# Validate syntax dulu
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload (zero-downtime — Caddy pakai new config tanpa drop connection)
sudo systemctl reload caddy

# Check status
sudo systemctl status caddy

# Tail log kalau ada issue
sudo journalctl -u caddy -f
```

Sekarang test:

```bash
# HTTP redirect
curl -I http://app.yourdomain.com          # → 308 Permanent Redirect ke https://

# HTTPS — Caddy auto-ACME cert issuance di background
curl -I https://app.yourdomain.com         # → 200 OK (cert valid otomatis)
curl -I https://api.yourdomain.com/healthz # → 200 OK (dari Go API)

# Custom domain user (setelah user point DNS)
curl -I https://myshop.id                  # → 200 kalau di /internal/caddy/ask allow
```

Cek log:

```bash
sudo tail -f /var/log/caddy/app-access.log
sudo tail -f /var/log/caddy/renderer-tenant.log
```

---

## 8. On-Demand TLS Flow

Ini flow saat user tambah custom domain di dashboard (`myshop.id`) — first-time visitor:

```
Visitor: https://myshop.id
   ↓
Caddy: kena TLS handshake, cek cert cache — MISS
   ↓
Caddy: call http://127.0.0.1:8080/internal/caddy/ask?domain=myshop.id&secret=XXX
   ↓
Web-builder API: cek DB → SELECT FROM domains WHERE hostname='myshop.id' AND status='verified'
   ├── OK  → return 200 → Caddy proceed ACME
   └── Not verified → return 404 → Caddy TIDAK issue cert (protect from abuse)
   ↓
Caddy: ACME challenge ke Let's Encrypt (HTTP-01 via port 80)
   ↓
Cert issued, cached di /var/lib/caddy/certificates/
   ↓
Visitor: dapet HTTPS response dari renderer
```

Cert auto-renew 30 hari sebelum expire — no manual action.

---

## 9. Log Rotation + Monitoring

Caddy log punya built-in rotation (100MB × 5 files = ~500MB per log). Untuk archive lebih lama, pakai logrotate atau `filebeat` push ke ELK/Loki.

Metrics — Caddy expose Prometheus endpoint (opt-in). Edit Caddyfile:

```caddyfile
{
    servers {
        metrics
    }
}

# Metrics endpoint di port terpisah (jangan expose ke public!)
:2019 {
    metrics /metrics
}
```

Scrape via Prometheus config:

```yaml
scrape_configs:
  - job_name: caddy
    static_configs:
      - targets: ["127.0.0.1:2019"]
```

**Firewall**: JANGAN allow port 2019 ke public. Cuma bind ke `127.0.0.1` (Caddy default) atau internal network.

---

## 10. Common Issues + Troubleshoot

### Cert issuance gagal — `no such host`
Cek DNS propagate:
```bash
dig +short app.yourdomain.com   # harus return server IP
```
Kalau kosong / IP salah, DNS belum propagate atau TTL lama.

### On-demand cert error — `too many failed requests`
Caddy internal cap 5 domain fail/2 menit (config `burst 5 interval 2m`). Cek endpoint `/internal/caddy/ask` di API log — biasanya karena domain user belum di-verify di dashboard.

### Port 80 conflict
Kalau ada `nginx` atau `apache` juga install:
```bash
sudo systemctl stop nginx apache2
sudo systemctl disable nginx apache2
```
Atau uninstall total:
```bash
sudo apt purge nginx apache2 -y
```

### Reverse proxy 502 Bad Gateway
- App PM2 belum start: `pm2 status`, `pm2 logs`
- Port salah: cek `netstat -tlnp | grep :8080` — pastikan proses listen di localhost
- Firewall block loopback: `iptables -L INPUT` — biasanya tidak block localhost

### Certificate wildcard butuh DNS provider plugin
Kalau mau `*.yourdomain.com` (wildcard cert), Caddy default cuma support HTTP-01 challenge yang gak bisa wildcard. Butuh DNS-01 challenge dengan plugin, mis. Cloudflare:

```bash
# Build ulang Caddy dengan plugin
sudo caddy add-package github.com/caddy-dns/cloudflare
```

Lalu di Caddyfile:
```caddyfile
*.yourdomain.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:4001
}
```

Set `CF_API_TOKEN` di systemd override sama caranya dengan `CADDY_ASK_SECRET`.

### Log renderer_tenant besar
Custom domain traffic bisa banyak. Naikin `roll_size` atau shorter retention. Untuk high traffic, streaming ke Loki/S3 lebih baik.

---

## 11. Referensi

- Official Caddy docs: https://caddyserver.com/docs
- On-demand TLS: https://caddyserver.com/docs/automatic-https#on-demand-tls
- Existing Caddyfile pattern (dev): [infra/caddy/Caddyfile](infra/caddy/Caddyfile)
- Env override systemd: `man systemd.exec`
