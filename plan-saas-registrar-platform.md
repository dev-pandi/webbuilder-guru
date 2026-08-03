# Plan — Web Builder sebagai SaaS Platform untuk PANDI Registrar

## Vision

Web builder + api-registry menjadi produk white-label yang dijual/dihibahkan
ke registrar Indonesian yang sudah **PANDI-accredited**. Customer:
- Sudah punya kredensial EPP ke PANDI (dan mungkin registry lain)
- Butuh platform reseller portal + web builder + payment + wallet + invoice
- Tidak mau build sendiri dari nol

Kita provide: **platform stack turnkey** (docker deploy → siap jalan). Mereka
plug EPP credentials + payment gateway credentials + brand.

## Target market

- Indonesian PANDI-accredited registrars (~puluhan-ratusan potential)
- Reseller/agency yang punya kontrak reseller-of-reseller dengan registrar
  accredited
- Corporate IT department yang manage banyak domain internal

## Business model options

| Model | Cara kerja | Cocok untuk |
|---|---|---|
| **One-time license + support** | Customer beli codebase, host sendiri, bayar recurring untuk support/update | Registrar established, punya tim DevOps |
| **SaaS subscription (multi-tenant)** | Kita host, tenant bayar bulanan/tahunan | Registrar baru, mau minimal ops |
| **Open-source + enterprise** | Core open, premium features + SLA support berbayar | Community growth |
| **Managed self-host** | Customer punya deployment, kita manage upgrade + monitoring | Middle ground |

**Rekomendasi awal**: One-time license + support (Option 1). Market Indonesian
registrar terbatas, self-host lebih diterima (data ownership, compliance).
Multi-tenant SaaS nyusul kalau ada demand.

## Zero registrar-api dependency — non-negotiable

Customer bukan reseller PANDI (mereka registrar), jadi web builder + api-registry
harus **native EPP direct**. Tidak boleh depend ke registrar-api PANDI sama
sekali di production build.

## Arsitektur high-level

```
┌────────────────────────────────────────────────────────┐
│  Frontend Next.js (dashboard + editor)                 │
└────────────────────┬───────────────────────────────────┘
                     │ HTTP + JWT
                ┌────▼───────────────┐
                │  Web Builder API   │  ← business layer:
                │  (Go/Fiber)        │    wallet, invoice, payment gateway,
                │                    │    zone catalog, pricing, promo,
                │                    │    users/reseller/agent, sites,
                │                    │    templates, on-behalf-of, docs
                └────┬───────────────┘
                     │ internal HTTP + mTLS/HMAC
                ┌────▼───────────────┐
                │  api-registry      │  ← EPP execution layer:
                │  (Go)              │    domain create/renew/transfer/delete,
                │                    │    contact create/update,
                │                    │    host create/delete,
                │                    │    whois proxy, async job runner
                └────┬───────────────┘
                     │ EPP over TLS
                ┌────▼───────────────┐
                │  Registry EPP      │  ← PANDI, or other EPP-compliant
                │  (per customer     │    registry (kalau customer punya
                │   accredited)      │    accreditation multi-registry)
                └────────────────────┘
```

**Config per deployment** (env-driven):
- `EPP_HOST`, `EPP_USER`, `EPP_PASSWORD`, `EPP_CERT` — kredensial customer
- `PAYMENT_GATEWAYS_ENABLED=midtrans,paylabs,manual_bank`
- `MIDTRANS_SERVER_KEY`, `PAYLABS_MERCHANT_ID`, dsb.
- `TAX_PPN_RATE=0.11` (dijalankan dari admin panel — lihat plan Phase 1)
- `BRAND_NAME`, `BRAND_LOGO_URL`, `PRIMARY_COLOR` (white-label)

## Roadmap (revised, skip accreditation) — STATUS SNAPSHOT

| Fase | Status | Deliverable |
|---|---|---|
| **Fase 0** | ✅ **DONE** | Interface abstraction (`registrar.Client.UsesAPIRegistry` + `*Direct` variants) |
| **Fase 1a** | ✅ **DONE** | api-registry service scaffolding + `pandi_wrapper` provider |
| **Fase 1b** | ✅ **DONE** | api-registry EPP direct via [al0fayz/epp-pandi-client](https://github.com/al0fayz/epp-pandi-client) |
| **Fase 1c** | ✅ **DONE** | Web builder dual-backend routing (Check/Whois/GetNS/UpdateNS route ke api-registry; Register/Renew via `*Direct` no payment coupling) |
| **Fase 1 (business layer)** | 🟡 **~80% DONE** | Backend + Admin UI + User invoice UI complete. Sisa: wizard migrate + wallet internal + data seed + Paylabs + docs. Lihat [plan-phase-1-webbuilder-selfsufficient.md](plan-phase-1-webbuilder-selfsufficient.md) |
| **Fase 2a** | ⏭️ Deferred | Async job runner (Asynq/Redis) di api-registry |
| **Fase 2b** | ⏭️ Deferred | Multi-registry (Verisign, CentralNic) |
| **Fase 3** | ⏭️ Deferred | White-label deployment kit (Docker Compose + Helm + branding config) |
| **Fase 4** | ⏭️ Optional | Multi-tenant SaaS mode, advanced analytics |

**Progress ringkas**: Fase 0 + 1a + 1b + 1c full done. Fase 1 (self-sufficient
business layer) ~80% — backend + admin UI + user invoice UI complete, sisa 6
task (~2 minggu). Setelah Fase 1 close, produk **siap dipasarkan ke pilot
customer** (Fase 3 nice-to-have untuk deployment ergonomics, tidak block sales).

### Cara verifikasi self-sufficient mode aktif

Set env:
```bash
REGISTRAR_API_URL=          # kosong → skip legacy
API_REGISTRY_URL=http://api-registry:5000
```

Startup log:
```
registrar client: self-sufficient mode — legacy registrar-api backend disabled,
                  EPP via api-registry only
```

Kalau muncul → produk sudah decoupled dari registrar-api PANDI di production
build.

## Design decisions yang perlu di-lock

Sebelum mulai eksekusi, ada 6 keputusan strategis:

1. **Deployment model** → **Self-host per customer** (rekomendasi). Docker Compose + Helm chart. Multi-tenant SaaS defer ke Fase 4.
2. **License model** → **One-time license + annual support fee** (rekomendasi). Simpler procurement untuk enterprise B2B.
3. **EPP library** → **Fork [`al0fayz/epp-pandi-client`](https://github.com/al0fayz/epp-pandi-client)** (rekomendasi). Sudah tested dengan PANDI, hemat 1-2 bulan reinvent.
4. **Registry support** → **PANDI-first, interface extensible**. Struktur mendukung EPP registry lain (Verisign untuk gTLD), tapi MVP fokus PANDI.
5. **Payment gateway** → **Pluggable dari awal**. MVP: Midtrans + Paylabs + manual bank transfer + deposit wallet. Interface untuk plug in gateway lain (BCA API, Faspay, Doku).
6. **Branding/theming** → **Config-based** (logo, color, brand name via env). Full theming (custom CSS) defer.

## Sub-plans (actionable per fase)

- **[plan-phase-1-webbuilder-selfsufficient.md](plan-phase-1-webbuilder-selfsufficient.md)** — detailed step-by-step untuk Fase 0 + 1 (~7-8 minggu), ready to start
- `plan-phase-2-api-registry-epp.md` — akan ditulis setelah Fase 1 sukses (validate market fit dulu)
- `plan-phase-3-white-label-deployment.md` — akan ditulis pasca Fase 2

## Non-goals (untuk MVP)

- Multi-tenant SaaS mode (defer ke Fase 4)
- Multi-registry accreditation ourselves (skip — customer sudah accredited)
- Support gTLD ICANN (defer sampai ada demand)
- Advanced analytics/BI (defer)
- White-label branding advanced (custom CSS/theme editor) — MVP cuma logo + color
- Mobile app (defer)

## Success criteria MVP

Bisa demo end-to-end di depan 1 pilot registrar Indonesia:
1. Deploy fresh instance dari Docker Compose < 30 menit
2. Admin set brand + payment methods + PPN + zones
3. Register reseller account, invite agent, invite client
4. Client cari domain .id → checkout via Midtrans → EPP register sukses → domain live di WHOIS
5. Reseller lihat wallet debit, invoice generated, PPN applied correctly
6. Full audit trail visible di admin

Kalau checklist di atas green, produk siap dijual.
