# Guide — Adding a new Provider

Tutorial step-by-step untuk menambah backend registrar/registry baru
(mis. Verisign untuk gTLD, ICANN registry lain, dsb.) tanpa touch handler
layer atau consumer.

**Prasyarat**: baca [`../README.md`](../README.md) + pahami interface
[`internal/provider/types.go::Provider`](../internal/provider/types.go).

## Konsep

Provider decoupled dari HTTP handler + client SDK via interface. Menambah
provider baru = implement interface + wire di [`main.go`](../cmd/server/main.go)
via env flag.

**Existing implementations**:
- `PandiWrapperProvider` — HTTP proxy ke registrar-api PANDI (Fase 1)
- `EPPDirectProvider` — native EPP client (Fase 2, TBD)
- `FakeProvider` — untuk test

Semua implement interface `provider.Provider` yang sama. Consumer (handler
+ SDK) tidak berubah waktu swap.

## Step-by-step

### 1. Bikin file provider baru

Contoh: `internal/provider/verisign_client.go` untuk .com/.net.

```go
package provider

import (
	"context"
	"time"
)

// VerisignProvider — EPP client untuk .com/.net/.org via Verisign registry.
// Butuh ICANN accreditation + EPP credentials Verisign.
type VerisignProvider struct {
	host, user, password string
	certPath, keyPath    string
	// ... EPP client state (TCP conn pool, session mgmt)
}

type VerisignConfig struct {
	Host     string
	User     string
	Password string
	CertPath string
	KeyPath  string
	Timeout  time.Duration
}

func NewVerisign(cfg VerisignConfig) (*VerisignProvider, error) {
	if cfg.Host == "" || cfg.User == "" {
		return nil, errors.New("EPP host + user wajib")
	}
	p := &VerisignProvider{
		host:     cfg.Host,
		user:     cfg.User,
		password: cfg.Password,
		certPath: cfg.CertPath,
		keyPath:  cfg.KeyPath,
	}
	// ... setup EPP conn pool
	return p, nil
}

func (p *VerisignProvider) Name() string { return "verisign_epp" }

func (p *VerisignProvider) Capabilities() Capabilities {
	// Sesuaikan berdasarkan apa yang Verisign registry expose.
	return Capabilities{
		HasWallet:        false, // Verisign tidak punya wallet — flow deposit di web builder
		HasDocumentFlow:  false, // gTLD tidak butuh KTP
		HasBulkCheck:     true,
		HasTransfer:      true,
		HasDNSSEC:        true,
		HasPromoInternal: false,
		HasContact:       true,
	}
}
```

### 2. Implement semua method Provider interface

Kalau method tidak applicable (mis. `UploadDocument` untuk gTLD),
return `ErrCapabilityMissing`:

```go
func (p *VerisignProvider) UploadDocument(ctx context.Context, req UploadDocumentRequest) (*UploadDocumentResponse, error) {
	return nil, fmt.Errorf("%w: gTLD tidak butuh document upload", ErrCapabilityMissing)
}
```

Handler layer sudah handle — return 503 `capability_missing` ke consumer.

**Compile-time guard**:

```go
var _ Provider = (*VerisignProvider)(nil)
```

Kalau ada method miss, compile fail — safety net.

### 3. Tambah config env baru

Di [`internal/config/config.go`](../internal/config/config.go):

```go
type Config struct {
    // ... existing fields ...

    // Verisign EPP (untuk gTLD .com/.net kalau customer accredited)
    VerisignHost     string
    VerisignUser     string
    VerisignPassword string
    VerisignCertFile string
    VerisignKeyFile  string
}
```

Di `Load()`:

```go
VerisignHost:     getEnv("VERISIGN_EPP_HOST", ""),
VerisignUser:     getEnv("VERISIGN_EPP_USER", ""),
VerisignPassword: getEnv("VERISIGN_EPP_PASSWORD", ""),
```

Tambah case validation kalau `PROVIDER_MODE=verisign_epp`.

### 4. Wire di main.go

```go
func buildProvider(cfg *config.Config) (provider.Provider, error) {
	switch cfg.ProviderMode {
	case "pandi_wrapper":
		// ... existing
	case "epp_direct":
		// ... existing
	case "verisign_epp":  // BARU
		return provider.NewVerisign(provider.VerisignConfig{
			Host:     cfg.VerisignHost,
			User:     cfg.VerisignUser,
			Password: cfg.VerisignPassword,
			CertPath: cfg.VerisignCertFile,
			KeyPath:  cfg.VerisignKeyFile,
		})
	default:
		return nil, fiber.NewError(fiber.StatusBadRequest, "mode tidak dikenal")
	}
}
```

### 5. Test dengan httptest / mock EPP server

Bikin `internal/provider/verisign_test.go`:

```go
func TestVerisign_RegisterDomain(t *testing.T) {
    // Kalau HTTP-based, pakai httptest.NewServer
    // Kalau TCP EPP-based, spawn mock EPP server dengan net.Listen
    // ...
}
```

Verify dengan `go test -race ./internal/provider/...`.

### 6. Update Instrumented decorator

Instrumented decorator auto-wrap semua Provider — TIDAK perlu edit karena
interface compliance sudah cukup. Kalau butuh nama operation baru, edit
[`internal/provider/instrumented.go`](../internal/provider/instrumented.go)
+ tambah `record()` call.

### 7. Update resilience decorator

Sama seperti Instrumented — auto-wrap. Circuit breaker + retry berlaku
per operation name. Kalau operation baru, tambah `wrap()` call.

### 8. Deploy

Update ConfigMap + Secret K8s / env docker-compose dengan credential baru,
apply. Restart pod. Verify via `/version` + `/healthz` bahwa provider
sudah swap.

## Testing checklist

- [ ] All `Provider` interface method compile (compile-time guard)
- [ ] `Name()` return unique string (untuk metric label)
- [ ] `Capabilities()` accurate (handler cek untuk enable/disable feature)
- [ ] Error mapping ke sentinel (`ErrNotFound`, `ErrValidation`, dst.) —
      supaya handler + resilience decorator classify benar
- [ ] Context cancellation dihormati (return `ctx.Err()` di long op)
- [ ] `/readyz` probe pass (min 1 op reachable)
- [ ] Metrics record: `api_registry_provider_calls_total{provider="<name>"}`
      increment saat call
- [ ] Circuit breaker trip kalau upstream down (verify manual: matikan
      upstream → 5 fail → circuit open → fast-fail)

## Provider capability reference

| Capability | PANDI wrapper | EPP direct (Fase 2) | Verisign |
|---|---|---|---|
| HasWallet | ✅ | ❌ | ❌ |
| HasDocumentFlow | ✅ | ✅ (Fase 2) | ❌ |
| HasBulkCheck | ✅ | ⚠️ | ✅ |
| HasTransfer | ✅ | ✅ (Fase 2) | ✅ |
| HasDNSSEC | ❌ | ✅ (Fase 2) | ✅ |
| HasPromoInternal | ✅ | ❌ | ❌ |
| HasContact | ✅ | ✅ | ✅ |

## Yang HARUS tetap di web builder (bukan di provider baru)

Sesuai plan-nya, api-registry cuma EPP + domain lifecycle. Ini tetap di
web builder side (jangan tambah ke Provider interface):
- Payment gateway (Midtrans/Paylabs)
- Invoice generator + PDF
- Wallet ledger
- Zone catalog (allowed TLD + pricing rules)
- Reseller/agent role
- Document metadata (link ke domain purchase)
- Promo code local (kalau ada)

Provider cuma **execute** domain lifecycle, business decision di web builder.
