# api-registry

Internal service untuk **domain lifecycle + EPP execution**. Konsumen tunggal:
web builder API (via internal HTTP + HMAC signature).

## Scope

- **✅ In scope**: domain check / register / renew / retry / cancel / status,
  nameserver update, contact update, WHOIS proxy, domain info.
- **❌ NOT in scope**: payment, invoice, wallet, promo, zone catalog, user
  management — semua ini di **web builder**.

Package ini pure "domain execution engine". Business logic (siapa yang boleh
register apa, harga berapa, dari mana dana) full di web builder.

## Provider architecture

Interface [`provider.Provider`](internal/provider/types.go) — abstract layer
di atas registrar operations. Dua implementasi (satu MVP + satu future):

| Mode | Status | Cara kerja |
|---|---|---|
| `pandi_wrapper` | ✅ MVP (Fase 1) | HTTP proxy ke registrar-api PANDI. Web builder dependency zero, tapi backend masih via registrar-api. |
| `epp_direct` | 🚧 Fase 2 | Native EPP client (TCP+TLS) langsung ke registry PANDI OT&E / production. Full independence. |

Swap via env `PROVIDER_MODE=pandi_wrapper` (default) atau `epp_direct`
(pending). Consumer (web builder API) tidak berubah — kontrak API-registry
tetap sama.

## Quick start (dev)

```bash
cd apps/api-registry
cp .env.example .env
# Edit .env: isi PANDI_API_URL + credentials (PANDI_API_KEY atau email/pass)
go run ./cmd/server
```

Verify:

```bash
curl http://localhost:5000/healthz
# → { "data": { "ok": true, "provider": "pandi_wrapper", "caps": {...} } }
```

## Authentication (HMAC)

All `/v1/*` endpoints require HMAC signature from web builder API. Header:

```
X-Timestamp: 1735672800
X-Signature: sha256=<hex(hmac_sha256(secret, "1735672800" + "." + METHOD + PATH + "." + BODY))>
```

Timestamp fresh window: ±5 menit. Kalau `INTERNAL_HMAC_SECRET` kosong (dev),
middleware skip — jangan pakai di prod.

## API endpoints

Semua di bawah `/v1`:

### Domain lifecycle
- `POST /domains/check` — availability + pricing per zone
- `POST /domains/register` — register domain (async, return `job_id`)
- `POST /domains/:name/renew` — renew (async)
- `GET  /domains/register/:job_id/status` — poll status
- `POST /domains/register/:job_id/retry` — retry failed job
- `POST /domains/register/:job_id/cancel` — cancel pending
- `GET  /domains/:name/info` — registry state (EPP domain:info) — Fase 2

### Nameserver
- `GET  /domains/:name/nameservers`
- `POST /domains/:name/nameservers` — body `{ nameservers: [...] }` (min 2, max 13)

### Contact
- `GET   /contacts/:id`
- `PATCH /contacts/:id` — direct contact update (any domain sharing this contact)
- `PATCH /domains/:name/contact` — domain-scoped contact update

### WHOIS
- `GET /whois?domain=<name>`

### Health
- `GET /healthz` — no auth

## Environment variables

Lihat [.env.example](.env.example). Yang wajib per mode:

**`pandi_wrapper` mode**:
- `PANDI_API_URL`
- `PANDI_API_KEY` **atau** (`PANDI_EMAIL` + `PANDI_PASSWORD`)

**`epp_direct` mode** (Fase 2):
- `EPP_HOST`, `EPP_USER`, `EPP_PASSWORD`, `EPP_CERT_FILE`, `EPP_KEY_FILE`

## Directory structure

```
apps/api-registry/
├── cmd/server/main.go          # binary entry point
├── internal/
│   ├── config/                 # env loader
│   ├── httpx/                  # response envelope helpers
│   ├── security/               # HMAC middleware
│   ├── provider/
│   │   ├── types.go            # Provider interface + DTOs
│   │   ├── errors.go           # sentinel errors
│   │   ├── pandi_client.go     # HTTP transport untuk registrar-api
│   │   └── pandi_impl.go       # Provider method implementations
│   ├── domains/handler.go      # HTTP handler: domain lifecycle
│   ├── hosts/handler.go        # HTTP handler: nameserver
│   ├── contacts/handler.go     # HTTP handler: contact
│   ├── whois/handler.go        # HTTP handler: WHOIS
│   ├── epp/                    # placeholder untuk EPP client (Fase 2)
│   └── jobs/                   # placeholder untuk async job runner (Fase 2)
├── go.mod
├── Dockerfile
├── .env.example
└── README.md
```

## Roadmap

- [x] Fase 1a: scaffolding + PandiWrapperProvider (MVP wrapper)
- [ ] Fase 1b: integration test terhadap registrar-api sandbox
- [ ] Fase 1c: web builder swap dari langsung ke registrar-api → ke api-registry
- [ ] Fase 2a: EPP client library integration (fork [`al0fayz/epp-pandi-client`](https://github.com/al0fayz/epp-pandi-client) atau custom)
- [ ] Fase 2b: `EPPDirectProvider` implementation
- [ ] Fase 2c: async job runner (Asynq/Redis) untuk long-running EPP call
- [ ] Fase 2d: multi-registry support (Verisign untuk .com, dll.)

## Related

- Web builder API (consumer): [`../api`](../api)
- Plan document: [`../../plan-saas-registrar-platform.md`](../../plan-saas-registrar-platform.md)
- Phase 1 tasks: [`../../plan-phase-1-webbuilder-selfsufficient.md`](../../plan-phase-1-webbuilder-selfsufficient.md)
