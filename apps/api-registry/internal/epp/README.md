# EPP client (placeholder — Fase 2)

Package ini future-nya berisi EPP client native (TCP+TLS, XML request/response,
session pool). Untuk MVP (Fase 1) tetap kosong — `PandiWrapperProvider`
handle semua via HTTP proxy ke registrar-api PANDI.

## Roadmap (Fase 2)

**Prerequisite yang sudah ada**: package [`../jobs`](../jobs) sudah live —
async worker Fase 2 tinggal swap `MemoryStore` ke persistence backend
(Postgres/Redis) + tambah worker goroutine yang consume dari queue.

1. Pilih library base:
   - Fork [`github.com/al0fayz/epp-pandi-client`](https://github.com/al0fayz/epp-pandi-client)
   - atau build dari [`github.com/domainr/epp`](https://github.com/domainr/epp) generic EPP
   - atau custom implementation dari RFC 5731-5734

2. Buat `Provider` implementation baru: `EPPDirectProvider` di
   `internal/provider/epp_direct.go` yang implement interface sama dengan
   `PandiWrapperProvider`. Config-driven via `EPP_HOST`, `EPP_USER`, dst.

3. Session pool + keepalive (EPP session mahal untuk setup, reuse).

4. Async job runner (Asynq/Redis) untuk EPP call yang bisa lambat — return
   `job_id` immediate, execute EPP di background, notify via webhook ke
   web builder.

5. Support multi-registry: config-driven per registry (PANDI, Verisign untuk
   .com kalau customer accredited).

## Kompatibilitas kontrak

`EPPDirectProvider` implement interface `provider.Provider` yang sama.
Swap zero-touch di `main.go`:

```go
if cfg.ProviderMode == "epp_direct" {
    p, err = provider.NewEPPDirect(cfg.EPPHost, cfg.EPPUser, ...)
} else {
    p, err = provider.NewPandiWrapper(...)
}
```

Handler layer tetap sama. Consumer (web builder API) tidak berubah.
